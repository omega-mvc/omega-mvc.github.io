# Omega MVC — Application Package Manual

The `Omega\Application` package is the application kernel. It builds the base,
wires path bindings, registers providers, boots the framework, and exposes the
global `app()`. `ApplicationInterface` extends the container contract, so the
application **is** the container: everything resolved through `app()->get(...)`
comes from the single container instance.

## The class hierarchy

```
Omega\Container\Container
        │
        └── Omega\Application\AbstractApplication implements Omega\Application\ApplicationInterface
                    │
                    └── Omega\Application\Application          (concrete runtime)
```

`Container` implements PSR-11 (`get`/`has`) plus the `Omega\Container\ContainerInterface`
contract — autowiring, `call`, `alias`, bindings, request-scoped singletons, etc.
The `ApplicationInterface` adds the kernel duties: bootstrapping, provider
registration, environment, maintenance mode, abort, terminate.

## Creating the application

```php
use Omega\Application\Application;

$app = new Application(__DIR__ . '/../');   // absolute base path
```

The constructor:

1. sets the `path.base` binding to `<base>/`;
2. calls `setConfigPath()` (binds `path.config` = `<base>/config/`);
3. registers the special bindings (`app`, `ApplicationInterface::class`,
   `ApplicationManifest::class`);
4. calls `registerAlias()` (see Aliases);
5. binds every standard path from `setDefinitions()` (see Paths).

Only one app can live at a time. Constructing a new `Application` flushes any
previous instance (via `flush()`) and becomes the new singleton — so repeated
construction for tests is safe. The app must be a concrete `Application`; a custom
class extending `AbstractApplication` is rejected with a `LogicException`
(`setBaseBinding()`).

## Getting the application

```php
use function Omega\Application\app;

$app = app();                       // Application (singleton)
$app->getInstance();                // ?Application — null before construction
$app->getName();                    // from binding app.name
$app->getVersion();                 // from binding app.version
$app->getEnvironment();             // from binding environment ('dev'/'prod'/...)
$app->isDev();                      // getEnvironment() === 'dev'
$app->isProduction();               // getEnvironment() === 'prod'
$app->isDebugMode();                // from binding app.debug (bool)
```

`app()` throws `Omega\Exceptions\ApplicationNotAvailableException`
(`Application not start yet!`) when no instance is set. The helpers `is_dev()`
and `is_production()` (same namespace) wrap the corresponding app methods.

## Environment

The environment is **not** read from `$_ENV` directly: it is a container binding
set by `loadConfig()` from the config repository:

```php
use Omega\Config\ConfigRepository;

$app->loadConfig($configs);   // binds config, environment, app.name, app.version, app.debug
```

`loadConfig(ConfigRepository $configs)` binds `config` (closure → repo), then
`environment = $configs['environment']`, `app.name = $configs['name']`,
`app.version = $configs['version']`, `app.debug = $configs['debug']`.

## Paths

`setDefinitions()` registers these bindings (all absolute, with leading/trailing
separators):

| Binding | Resolves to |
| ------- | ----------- |
| `boot.cache` | `<base>/bootstrap.cache/` |
| `path.app` | `<base>/app/` |
| `path.cache` | `<base>/storage/app/cache/` |
| `path.command`, `path.controller`, `path.middleware`, `path.model`, `path.provider`, `path.exception` | the matching `app/...` subfolders |
| `path.component`, `path.view` | `<base>/resources/components/`, `<base>/resources/views/` |
| `path.storage`, `path.logs` | `<base>/storage/`, `<base>/storage/logs/` |
| `path.public` | `<base>/public/` |
| `path.migrations`, `path.seeder`, `path.database` | `<base>/database/...` |
| `path.compiled_view_path` | `<base>/storage/app/view/` |
| `paths.view` | array with the view path |
| `path.config` | `<base>/config/` (set by `setConfigPath()`) |

Read them with the helpers:

```php
use function Omega\Application\{path, get_path, set_path, slash};

get_path('path.storage');             // '<base>/storage/'
get_path('path.storage', 'logs');     // '<base>/storage/logs'  (appends suffix)
get_path(['path.app', 'path.view']);  // maps arrays
path('app.config');                   // relative: 'app/config/'
set_path('app.config');               // absolute-styled: '/app/config/'
slash('/a/b');                        // forward slashes → DIRECTORY_SEPARATOR
os_detect();                          // 'windows'|'linux'|'mac'|'bsd'|'solaris'|'unknown'
```

All helpers live in `namespace Omega\Application` — import them with
`use function` or call fully qualified. `set_path()` throws `InvalidArgumentException`
on an empty key.

## Container bindings

The container alphabet, inherited from `ContainerInterface`:

```php
$app->bind(Interface::class, Implementation::class, shared: true);  // shared singleton
$app->set('some.value', $value);            // store a value directly
$app->alias(Interface::class, 'some.name'); // name → interface
$app->make(Class::class);                   // fresh instance (bypasses cache)
$app->get(Class::class);                    // cached if shared
$app->call($callable);                      // call with auto-DI
$app->has($abstract); $app->bound($abstract); $app->resolved($abstract);
$app->getBindings();
```

Aliases registered by `registerAlias()`:

- `request` → `Omega\Http\Request::class`
- `view.instance` → `Omega\View\Templator::class`
- `vite.gets` → `Omega\View\Vite::class`
- `config` → `Omega\Config\ConfigRepository::class`

## Bootstrap sequence

```php
use Omega\Application\Bootstrapper\RegisterProviders;
use Omega\Application\Bootstrapper\BootProviders;

$app->bootstrapWith([RegisterProviders::class, BootProviders::class]);
```

`bootstrapWith()` `make()`-s each bootstrapper and calls `->bootstrap($app)`.
The framework sequence:

1. **RegisterProviders** — union of `getCoreProviders()` + config `providers` +
   package providers (from the manifest), filtered to real `AbstractServiceProvider`
   subclasses and deduplicated, each passed to `$app->register($p)`.
2. **BootProviders** — delegates to `$app->bootProvider()`.

`bootProvider()` runs `booting()` callbacks, then boots each core provider not yet
booted, then runs `booted()` callbacks, then marks the app booted.

### Lifecycle callbacks

```php
$app->bootingCallback(fn () => ...);   // before providers boot
$app->bootedCallback(fn () => ...);    // after providers boot (runs immediately if already booted)
$app->registerTerminate(fn () => ...); // end-of-request cleanup (chainable)
$app->terminate();                     // runs all terminate callbacks
```

### Late providers

`register(string $provider)` is idempotent: registering an already-loaded provider
returns a fresh instance without re-registering. A provider registered **after**
the app is booted is booted immediately (synchronously).

## Persistent workers

`resetForRequest()` is the per-request reset for RoadRunner/Swoole:

```php
$app->resetForRequest();
```

It clears terminate/booting/booted callbacks, `resetRequestScope()` (drops cached
request-scoped singletons), `Router::reset()`, `AbstractFacade::flushInstance()`,
clears the Templator's clearables, and re-registers web routes. `flush()` (used
also by a new construction) additionally nulls the shared instance and resets
provider lists.

## Maintenance mode

```php
$app->isDownMaintenanceMode();  // true when <storage>/app/maintenance.php exists
$app->getDownData();            // ['redirect'=>null,'retry'=>null,'status'=>503,'template'=>null]
```

`getDownData()` includes the `<storage>/app/down` file (no `.php` extension) and
merges its returned array over the defaults.

## Abort

```php
$app->abort(404, 'Not found', ['X-Foo' => 'bar']);
```

Always throws `Omega\Http\Exceptions\HttpException($code, $message, null, $headers)`;
you can catch it and read `getStatusCode()` / `getHeaders()`.

## Package manifest

`ApplicationManifest` discovers Composer packages that ship service providers:

- `providers(): array` — provider class-string from `extra.omega-mvc` of each
  installed package.
- `build(): array` — scans `<base>/vendor/composer/installed.json`, keeps packages
  with `extra['omega-mvc']`, writes `<bootstrap.cache>/packages.php`
  (`<?php return [...] ;`), returns the map.
- Constructor: `(string $basePath, string $applicationCachePath, ?string $vendorPath = null)`.

The disk cache short-circuits `installed.json` reads; delete `packages.php` (or
call `build()`) to refresh. It is wired as container binding
`ApplicationManifest::class` (a factory closure) by the constructor.

## Core providers

`getCoreProviders()` returns the providers list of the concrete `Application`
(booted in this order):

```
WhoopsServiceProvider, LoggingServiceProvider, EventServiceProvider,
CronServiceProvider, HashServiceProvider, RouteServiceProvider,
SessionServiceProvider, DatabaseServiceProvider, ViewServiceProvider,
CacheServiceProvider, RateLimiterServiceProvider, RedisServiceProvider,
Http\MacroServiceProvider, CsrfServiceProvider
```

## Exceptions

| Exception | When thrown |
| --------- | ----------- |
| `Omega\Exceptions\ApplicationNotAvailableException` (`RuntimeException`) | `app()` before any application is constructed — `Application not start yet!` |
| `Omega\Http\Exceptions\HttpException` (`RuntimeException`) | `abort()` — carries `getStatusCode()`, `getHeaders()` |
| `LogicException` | constructing a non-concrete `AbstractApplication` subclass |
| `InvalidArgumentException` | `set_path('')` with an empty key |
| Container exceptions | any `get`/`make`/`alias` failure (`EntryNotFoundException`, `BindingResolutionException`, `CircularAliasException`, `AliasException`) |

## Notes

- The Application package defines **no events**; lifecycle is callback-based
  (`booting` / `booted` / `terminate` / `resetForRequest`).
- There is **no top-level** `Application::run()`/`bootstrap()` convenience method;
  the entry sequence is `new Application($base)`, `bootstrapWith([...])`, and a
  web/server loop calling `terminate()` / `resetForRequest()` at boundaries.
- Helpers are namespaced (`Omega\Application`) and must be imported with
  `use function`.
- Environment/debug/name/version are container bindings, not env reads.

## Reference

- `ApplicationInterface.php`, `AbstractApplication.php`, `Application.php`
- `ApplicationManifest.php`, `helper.php`
- `Bootstrapper/RegisterProviders.php`, `Bootstrapper/BootProviders.php`
- Depends on: `Omega\Container`, `Omega\Config\ConfigRepository`,
  `Omega\Router`, `Omega\Facade`, `Omega\View\Templator`, `Omega\Http\Exceptions`
- Tests: `tests/Unit/Application/`, `tests/Unit/Container/`
- License: GPL-3.0+