# Omega MVC — Service Provider Manual

Service providers are the composition root of an Omega MVC application. A provider
encapsulates the two phases of bootstrapping — **register** (bind services into the
container) and **boot** (use already-bound services: register routes, attach event
listeners, configure integrations). Providers ship with vendor packages and are
auto-discovered via Composer `extra.omega-mvc`.

The provider contract lives in `Omega\Container` (`AbstractServiceProvider` +
`AppServiceProviderTrait`); the registration/boot machinery lives in
`Omega\Application`.

## The provider contract

```php
namespace Omega\Container;

use Omega\Application\ApplicationInterface;

abstract class AbstractServiceProvider
{
    use AppServiceProviderTrait;

    protected array $register = [];   // declarative class-string list

    public function __construct(protected ApplicationInterface $app) {}

    public function boot(): void {}
    public function register(): void {}
}
```

- The constructor receives the application (which *is* the container) —
  `$this->app` is how you bind services.
- Override `register()` to declare bindings; it is called before any boot.
- Override `boot()` for post-registration work; it runs after every provider has
  been registered.
- The `$register` property is a **declarative** list of class-strings that
  subclasses may fill; there is no automatic processing loop in the base class —
  use it as a convention (e.g. iterate it inside `register()`).

## Writing a provider

```php
namespace App\Providers;

use Omega\Application\ApplicationInterface;
use Omega\Container\AbstractServiceProvider;

final class AppServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
        $this->app->bind(StatsInterface::class, StatsCollector::class, shared: true);
        $this->app->bind('app.locale', fn () => config('app.locale', 'en'));
    }

    public function boot(): void
    {
        $templator = $this->app->get(Omega\View\Templator::class);
        $templator->share('year', (new Omega\Time\Now())->format('Y'));

        $dispatcher = $this->app->get(DispatcherInterface::class);
        $dispatcher->addListener('user.registered', [...]);

        // Routes can be registered here via Omega\Router\Router
    }
}
```

Register it with the application:

```php
$app->register(App\Providers\AppServiceProvider::class);
```

### Registering: semantics

`Application::register(string $provider): AbstractServiceProvider`

- Already-loaded provider? Returns a fresh instance **without** re-registering
  (dedup guard).
- Otherwise it constructs `new $provider($app)`, calls `$provider->register()`,
  and marks it loaded.
- **Late provider:** if the app is already booted (`isBooted === true`), the
  provider is booted immediately and synchronously.

### The boot phase

`Application::bootProvider()` runs:

1. `booting` callbacks (`bootingCallback()`),
2. each not-yet-booted core provider's `boot()` method (order below),
3. `booted` callbacks (`bootedCallback()` — also fires immediately for callbacks
   registered after booting),
4. marks the application as booted (`$app->isBooted`).

## Bootstrap flow in the framework

```php
use Omega\Application\Bootstrapper\RegisterProviders;
use Omega\Application\Bootstrapper\BootProviders;

$app->bootstrapWith([
    RegisterProviders::class,   // 1. register phase for ALL providers
    BootProviders::class,       // 2. boot phase via bootProvider()
]);
```

### RegisterProviders

Unions three provider sources and registers each (after filtering to real
`AbstractServiceProvider` subclasses and deduplicating):

1. `$app->getCoreProviders()` — the built-in provider stack;
2. **config providers** — `config('providers', [])`, only if the `config`
   binding resolves to a `ConfigRepository`;
3. **package providers** — `ApplicationManifest::providers()`, i.e. what each
   installed Composer package declares under `extra.omega-mvc`.

### BootProviders

Simply delegates: `$app->bootProvider()`.

## Core providers (boot order)

The concrete `Application` boots these providers in order:

```
1.  Omega\Exceptions\WhoopsServiceProvider
2.  Omega\Logging\LoggingServiceProvider
3.  Omega\Event\EventServiceProvider
4.  Omega\Cron\CronServiceProvider
5.  Omega\Security\HashServiceProvider
6.  Omega\Router\RouteServiceProvider
7.  Omega\Session\SessionServiceProvider
8.  Omega\Database\DatabaseServiceProvider
9.  Omega\View\ViewServiceProvider
10. Omega\Cache\CacheServiceProvider
11. Omega\RateLimiter\RateLimiterServiceProvider
12. Omega\Redis\RedisServiceProvider
13. Omega\Http\MacroServiceProvider
14. Omega\Csrf\CsrfServiceProvider
```

## Vendor-package providers — `ApplicationManifest`

A vendor package advertises one or more providers via Composer metadata:

```json
{
    "name": "acme/widgets",
    "extra": {
        "omega-mvc": {
            "providers": ["Acme\\Widgets\\WidgetServiceProvider"]
        }
    }
}
```

`ApplicationManifest` reads `<base>/vendor/composer/installed.json`, keeps every
package with `extra['omega-mvc']`, writes a var_export cache at
`<bootstrap.cache>/packages.php`, and exposes `providers(): array` (flattened,
non-empty class-string values). The disk cache short-circuits `installed.json`;
delete `packages.php` to rebuild. Bind to get it directly:

```php
use Omega\Application\ApplicationManifest;

$manifest = $app->make(ApplicationManifest::class);
$manifest->providers();
$manifest->build();   // force rebuild
```

## Exporting files and dirs — `AppServiceProviderTrait`

The trait gives providers the ability to publish package assets (configs, views,
migrations) into the application:

```php
use Omega\Container\AbstractServiceProvider;
use function Omega\Application\get_path;

final class WidgetServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
        self::export([
            __DIR__ . '/../config/widgets.php' => get_path('path.config') . 'widgets.php',
            __DIR__ . '/../resources/views'    => get_path('path.view') . 'widgets',
        ]);
    }
}

use WidgetServiceProvider as P;

P::importFile($from, $to, $overwrite: true);   // bool — copy single file
P::importDir($from, $to, $overwrite: true);    // bool — recursive copy
P::getModules();                              // array grouped by tag
P::flushModule();                             // clear the static registry
```

- `export(array $path, string $tag = '')` declares source → destination mappings
  into a static registry (`$modules`), keyed by an optional tag; the framework's
  `vendor:publish` command (`Omega\Console\Commands\VendorPublishCommand`) reads
  `getModules()` and performs the copies via `importFile` / `importDir`. Import
  methods return `false` when the source is missing/unreadable and throw
  `Exception` (`You do not have permission to overwrite the destination file.`)
  on existing destinations when `$overwrite` is `false`.

## Exceptions to remember

- Container exceptions (registering-time binding errors): `BindingResolutionException`,
  `EntryNotFoundException`, `AliasException`, `CircularAliasException`.
- Manifest miss-use: `$app->make(ApplicationManifest::class)` requires the
  `ApplicationManifest::class` factory binding the app constructor sets.
- `AbstractServiceProvider::__construct` requires the `ApplicationInterface`
  argument; constructing a provider outside the app's `register()` is possible but
  unusual (you would pass `app()`).

## Notes

- There is **no** separate `ServiceProviderInterface` and **no** deferred/provider-
  priority mechanism: registration order is the config/core list order, and a
  provider registered after boot boots immediately.
- `boot()` and `register()` are **empty by default** — a provider may implement
  only one of them.
- Providers are resolved as classes (not singletons): `register()` returns/uses a
  per-call instance; the dedup guard lives in `Application::$loadedProviders`.
- Keep `register()` free of runtime dependencies: bind, don't resolve. Use `boot()`
  for anything that reads bound services.

## Reference

- `Omega\Container\AbstractServiceProvider.php`, `Omega\Container\AppServiceProviderTrait.php`
- `Omega\Application\ApplicationInterface::register/bootProvider/bootstraps`
- `Omega\Application\Bootstrapper\RegisterProviders.php`, `Bootstrapper/BootProviders.php`
- `Omega\Application\ApplicationManifest.php`
- Tests: `tests/Unit/Container/AbstractServiceProviderTest.php`,
  `tests/Unit/Application/`
- License: GPL-3.0+