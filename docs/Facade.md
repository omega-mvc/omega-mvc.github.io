# Omega MVC — Facade Package Manual

The `Omega\Facade` package provides facades: static proxies that forward static
calls to an underlying service resolved from the application container. It gives
you Laravel-style static access (`Config::get('app')`) while keeping services
container-managed, swappable, and testable. Only four files make up the package:
`AbstractFacade`, `FacadeInterface`, one exception, and one bootstrapper.

## The contract

`FacadeInterface` declares a single static method that every facade must
implement — the container key that resolves the underlying instance:

```php
namespace Omega\Facade;

interface FacadeInterface
{
    public static function getFacadeAccessor(): string;
}
```

## Defining a facade

Create a `final` class extending `AbstractFacade` and return the container
binding key:

```php
namespace App\Facade;

use Omega\Facade\AbstractFacade;

final class MyService extends AbstractFacade
{
    public static function getFacadeAccessor(): string
    {
        return 'my-service';
    }
}
```

Any static call not defined on `AbstractFacade` itself is forwarded to the
instance resolved from the container:

```php
MyService::doSomething($arg);        // => $container->get('my-service')->doSomething($arg)
```

The framework ships these facades as examples:

- `Omega\Logging\Facade\Logger` → `'logging'`
- `Omega\Config\Facade\Config`
- `Omega\Database\Facades\DB`, `PDO`, `Schema`
- `Omega\Cache\Facade\Cache`
- `Omega\Cron\Facade\Schedule`
- `Omega\Security\Facade\Hash`
- `Omega\View\Facades\View`, `Vite`

## How instances are resolved

`AbstractFacade` keeps the resolved instances in a static cache map
(`accessor => instance`). Resolution runs through the container's `make()`
for the accessor key:

```php
protected static function getFacadeBase(string $name): mixed
{
    if (static::$app === null) {
        throw new FacadeObjectNotSetException(static::class);
    }

    if (array_key_exists($name, static::$instance)) {
        return static::$instance[$name];
    }

    return static::$instance[$name] = static::$app->make($name);
}
```

Resolution failures surface the container's exceptions (`BindingResolutionException`,
`CircularAliasException`, `EntryNotFoundException`, `ReflectionException`, and
PSR `ContainerExceptionInterface`).

## Setting the application container

Facades need the container before any static call. Two ways:

```php
use Omega\Application\ApplicationInterface;
use Omega\Facade\AbstractFacade;

$facade = new AbstractFacadeChild($app);   // constructor sets static::$app
AbstractFacade::setFacadeBase($app);       // or directly

AbstractFacade::setFacadeBase();           // unset (null)
```

The framework wires this automatically via the bootstrapper:

```php
use Omega\Facade\Bootstrapper\FacadeBootstrapper;

new FacadeBootstrapper()->bootstrap($app);   // AbstractFacade::setFacadeBase($app)
```

If a static call is made while no container is set, `FacadeObjectNotSetException`
is thrown:

```php
throw new FacadeObjectNotSetException(static::class);
// "The facade instance for X has not been set. Please ensure that the facade is
//  registered with the application container and that the container is configured correctly."
```

## Persistent workers

Instances are cached statically, so in a persistent worker (RoadRunner etc.) the
cache would survive request boundaries. Clear it at request end:

```php
use Omega\Facade\AbstractFacade;

AbstractFacade::flushInstance();   // static::$instance = []
```

This keeps each request resolving fresh instances while `$app` (set once by the
bootstrapper) is reused.

## API summary

| Member | Signature | Purpose |
| ------ | --------- | ------- |
| `AbstractFacade::__construct` | `(ApplicationInterface $app)` | Sets `static::$app` |
| `AbstractFacade::setFacadeBase` | `static (?ApplicationInterface $app = null): void` | Sets/unsets the container for all facades |
| `AbstractFacade::getFacadeAccessor` | `static (): string` | Abstract; the container key |
| `AbstractFacade::getFacade` | `protected static (): mixed` | Resolves via the accessor |
| `AbstractFacade::getFacadeBase` | `protected static (string $name): mixed` | Container `make()` with static caching |
| `AbstractFacade::flushInstance` | `static (): void` | Clears the instance cache |
| `AbstractFacade::__callStatic` | `static (string $name, array $arguments): mixed` | Forwards calls to the resolved instance |
| internal `$app` | `protected static ?ApplicationInterface = null` | Shared container reference |
| internal `$instance` | `protected static array = []` | Accessor → instance cache |

## Exceptions

| Exception | When thrown |
| --------- | ----------- |
| `Exceptions\FacadeObjectNotSetException` (extends `RuntimeException`) | A static call runs with `$app === null` |

Container exceptions are propagated as-is during resolution.

## Notes

- `AbstractFacade` is abstract but **not final**, so it can be extended by user
  facades (subclassing is intended).
- There is **no public way** to resolve the underlying instance other than a
  static call or `getFacadeAccessor()`; the raw instance method is protected.
- Facades are a convenience over the container — prefer constructor injection
  inside services, and use facades at the boundary (controllers, templates).

## Reference

- `AbstractFacade.php` (151 lines), `FacadeInterface.php`, `FacadeBootstrapper.php`
- `Exceptions/FacadeObjectNotSetException.php`
- Concrete facades: `Logging`, `Config`, `Database`, `Cache`, `Cron`, `Security`, `View`
- Tests: `tests/Unit/Facades/`
- License: GPL-3.0+