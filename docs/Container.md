# Omega MVC — Container Package Manual

The `Omega\Container` package is the dependency-injection container at the heart
of the framework. It is PSR-11 compliant, supports bindings (shared/transient),
aliases, autowiring with reflection caching, a DI-aware callable invoker, the
`#[Inject]` attribute, context parameter overrides, and request-scoped singletons
for persistent workers. The application kernel (`Omega\Application`) *is* an
instance of this container.

## Container bindings

```php
use Omega\Container\Container;

$container = new Container();

$container->bind(FooInterface::class, ConcreteFoo::class);
$container->bind(FooInterface::class, ConcreteFoo::class, shared: true); // singleton
$container->bind('greeting', fn () => new Greeting('hello'), shared: true);

$container->set('config.value', ['debug' => true]);   // store a raw value
$container->set('factory', fn () => new Thing());     // closure → shared binding

$container->alias(FooInterface::class, 'foo');         // name → abstract
```

- `bind(string $abstract, Closure|string|null $concrete = null, bool $shared = false): void`
  treats a `null` concrete as the abstract itself (class-name = concrete). There is
  **no `singleton()` method** — pass `shared: true`.
- `set(string $name, mixed $value): void` stores non-closure values directly in
  the instance cache and still registers a binding so `has()`/`bound()` work.
- `alias()` throws `AliasException` for self-aliasing; alias chains are resolved
  recursively with `CircularAliasException` cycle detection.
- Binding state lives in a flat registry: `getBindings(): array`
  (`abstract => ['concrete' => Closure, 'shared' => bool]`).

## Resolving

```php
$object = $container->get(Service::class);    // cached when shared; EntryNotFoundException if absent
$object = $container->make(Service::class);   // always a fresh instance
$object = $container->make(Service::class, ['id' => 42]);   // parameter overrides
$exists = $container->has('foo');             // bound OR autowireable (instantiable class)
$bound   = $container->bound('foo');          // binding or cached instance exists
$resolved = $container->resolved('foo');      // actually instantiated (cached)
```

- `get()` reads the cache and throws `EntryNotFoundException`; `make()` **bypasses
  the cache on read** (parameters accepted) but still writes it back for shared
  bindings.
- `build(string|Closure $concrete, array $parameters = [])` resolves a class via
  the resolver (autowiring) or executes a closure directly.
- `arrayAccess`: `$o['service']` → `has`/`make` (fresh); `$o['k'] = $v` → `bind`
  (closure wrapped); `unset($o['k'])` drops instances, bindings and related aliases.

## Parameter overrides (context binding)

During resolution, parameters passed to `make()`/`resolve()` are pushed onto an
override stack (`$with`); the top entry is visible as
`getLastParameterOverride(): array`. Constructor resolution consults named
parameter overrides before type-based autowiring. The app uses this for
request-scoped contextual values.

## Calling callables with DI — `call()`

```php
$result = $container->call(fn (LoggerInterface $logger) => $logger->info('hi'));

// class-string invokable, [Class, 'method'], object with __invoke, closures:
$container->call([$controller, 'store']);
$container->call(JobHandler::class);
$container->call($invokableObject);
```

Resolution priority per parameter: by name from `$parameters`, by position, by
type from the container, special-case `$container` (injects the container when an
untyped param is named `container`), the parameter's default value, then any
remaining positional values. A unresolvable parameter throws
`BindingResolutionException` (`Unable to resolve dependency [...] in callable`).

## Autowiring — `Resolver`

`build()` on a class string delegates to the resolver:

```php
$obj = $container->build(NonConstructibleConfig::class, [...]);
// constructor deps resolved via: named override → positional override → override
// stack → type-based autowiring (interface bindings first, then fresh make())
```

- Non-instantiable targets throw `BindingResolutionException("Target [X] is not
  instantiable.")`.
- Circular constructor dependencies are detected with a build stack:
  `Circular dependency detected while trying to build [X]. Path: A -> B -> X.`
- Union types resolve whichever bound member matches first; **intersection types
  are not supported**; a nullable unresolvable dependency resolves to `null`
  rather than failing.
- Unresolvable (non-autowireable) dependencies throw
  `Unresolvable dependency resolving [X] in class Y: ...`.

## Property and method injection — `Injector`

`injectOn(object $instance): object` returns the same instance after `#[Inject]`
processing. Public methods (except constructors/statics) marked `#[Inject]` get
their parameters resolved and are invoked; public properties marked `#[Inject]`
are assigned from the container.

```php
use Omega\Container\Attribute\Inject;

final class Reporter
{
    #[Inject(LoggerInterface::class)]
    public LoggerInterface $logger;

    #[Inject(['notifier' => NotificationChannel::class])]
    public function setNotifier(NotificationChannel $notifier): void { }
}
```

`#[Inject]` targets methods, properties, and constructor/method parameters. Its
argument forms: nothing (autowire all typed params), a class-string (property /
parameter injection), or an associative array of parameter-name → abstract
(method-level config). Resolution failures (`BindingResolutionException` /
`EntryNotFoundException`) are swallowed silently per member.

## The `#[Inject]` attribute on parameters

```php
use Omega\Container\Attribute\Inject;

function handler(#[Inject(Database::class)] $db, array $context): void { }
```

Explicit parameter injection overrides both type-based and default resolution.

## Reflection cache

`ReflectionCache` stores `ReflectionClass`, `ReflectionMethod`, and constructor
parameters per FQCN, with `null` for “no constructor” (guarded by
`array_key_exists`). Access it through the container:

```php
$container->getReflectionClass(A::class);           // ReflectionClass (throws ReflectionException)
$container->getReflectionMethod(A::class, 'go');    // ReflectionMethod
$container->getConstructorParameters(A::class);     // ?array<ReflectionParameter>
$container->clearCache();                           // drop only reflection cache
```

## Request-scoped singletons

For persistent workers (RoadRunner/Swoole) where the container survives requests:

```php
$container->setRequestScoped('session');     // chainable; a shared binding
// ... per request ...
$container->resetRequestScope();             // drop cached instances for scoped bindings only
```

Scoped binding definitions persist; only cached instances are dropped, so the next
`get()` re-resolves lazily. `resetForRequest()` on the Application calls this.

## Reset

```php
$container->flush();   // nukes bindings, instances, aliases, overrides, requestScoped; sub-objects
```
Note: `flush()` nulls `bindings`, `instances`, `aliases`, `with`, `requestScoped`,
`resolver`, `invoker` and the reflection cache — but it **does not** reset the
internally cached `Injector` instance.

## ContainerInterface recap

```php
interface ContainerInterface extends Psr\Container\ContainerInterface
{
    public function alias(string $abstract, string $alias): void;
    public function bind(string $abstract, Closure|string|null $concrete = null, bool $shared = false): void;
    public function build(string|Closure $concrete, array $parameters = []): mixed;
    public function bound(string $abstract): bool;
    public function resolved(string $abstract): bool;
    public function call(callable|object|array|string $callable, array $parameters = []): mixed;
    public function clearCache(): ContainerInterface;
    public function getReflectionClass(string $class): ReflectionClass;
    public function getReflectionMethod(string|object $class, string $method): ReflectionMethod;
    public function getConstructorParameters(string $class): ?array;
    public function getLastParameterOverride(): array;
    public function getBindings(): array;
    public function make(string $name, array $parameters = []): mixed;
    public function injectOn(object $instance): object;
    public function set(string $name, mixed $value): void;
    public function flush(): void;
    public function getAlias(string $abstract): string;
    // + get(string $id): mixed; has(string $id): bool  (PSR-11)
}
```

## Exceptions

All in `Omega\Container\Exceptions`:

| Exception | Extends | Thrown when |
| --------- | ------- | ----------- |
| `ContainerException` | `Exception` (implements PSR `ContainerExceptionInterface`) | generic container failure |
| `EntryNotFoundException` | `Exception` (implements PSR `NotFoundExceptionInterface`) | `get()` with no entry/binding — `No entry was found for '{name}' identifier.` |
| `BindingResolutionException` | `Exception` (implements `ContainerExceptionInterface`) | non-instantiable targets, circular/unsupported/unresolvable dependencies |
| `AliasException` | `BindingResolutionException` | self-alias — `{abstract} is aliased to itself.` |
| `CircularAliasException` | `BindingResolutionException` | cyclic alias chains |

## Notes

- No `singleton()`, no tags, no `when()->needs()->give()`: shared-ness is a
  boolean flag, context values go through the parameter-override stack.
- `make()` never reads the cache but writes it for shared bindings — a subtle
  difference from `get()` worth remembering.
- The `$register`/provider side of the container is documented separately in
  `ServiceProvider.md`.

## Reference

- `ContainerInterface.php`, `Container.php`
- `Resolver.php`, `Invoker.php`, `Injector.php`, `ReflectionCache.php`
- `Attribute/Inject.php`
- `Exceptions/` (5 classes)
- `AbstractServiceProvider.php`, `AppServiceProviderTrait.php` → see `ServiceProvider.md`
- Tests: `tests/Unit/Container/`
- License: GPL-3.0+