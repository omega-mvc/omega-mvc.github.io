# Omega MVC — Router Package Manual

The `Omega\Router` package is a **static** routing engine. Routes are registered
through `Router::get()/post()/...`, grouped with `prefix()`, `middleware()`,
`group()`, and dispatched with `Router::run()` against the incoming URI and HTTP
method. It supports method-aware matching, named route parameters and placeholders,
attribute-based controllers, URL generation, and route caching.

## Defining routes

```php
use Omega\Router\Router;

Router::get('/users', fn () => 'user list');
Router::get('/users/(:id)', fn (int $id) => "user $id");
Router::post('/users', fn () => 'created');
Router::put('/users/(:id)', ...);
Router::patch('/users/(:id)', ...);
Router::delete('/users/(:id)', ...);
Router::options('/users', ...);
Router::any('/ping', fn () => 'pong');                 // all seven methods
Router::match(['get', 'post'], '/submit', ...);        // custom method set
```

`get()` and `any()` match multiple methods: `get()` accepts `GET` and `HEAD`;
`any()` accepts `get`, `head`, `post`, `put`, `patch`, `delete`, `options`.
`match()` accepts an array of methods. Handlers can be closures, controller
`[Class::class, 'method']` arrays, or strings.

### Placeholders

The router expands friendly aliases in the URI into regex:

| Alias | Regex |
| ----- | ----- |
| `(:id)` | `(\d+)` |
| `(:num)` | `([0-9]*)` |
| `(:text)` | `([a-zA-Z]*)` |
| `(:any)` | `([0-9a-zA-Z_+-]*)` |
| `(:slug)` | `([0-9a-zA-Z_-]*)` |
| `(:all)` | `(.*)` |

```php
Router::get('/users/(:id)', fn ($id) => ...);            // /users/42
Router::get('/posts/(\d+)/(:slug)', ...);                 // raw regex also works
Router::get('/files/(name:slug).txt', fn ($name) => ...);  // named group, captures $name
```

`Router::$patterns` (public) maps alias → regex and can be extended at runtime;
`mapPatterns()` applies alias replacement and `(name:alias)` named groups.

### Fluent configuration — `Route`

Every registration returns a `Route` object (which also implements `ArrayAccess`):

```php
$route = Router::get('/users/(:id)', 'UserController@show');
$route->name('user.show');                 // route name, used by has()/redirect()
$route->middleware([AuthMiddleware::class, LogMiddleware::class]);
$route->where(['id' => '\d+']);            // custom param patterns for this route
$route['key'] = 'value';                   // array access set/get
$route->route();                           // magic accessor: full definition array
```

`route()` is the only pseudo-method accepted by `__call`; anything else throws
`RouteNotRegisteredException`. Route data keys: `method`, `uri`, `expression`,
`function`, `patterns`, `middleware`, `name`.

## Groups

```php
use Omega\Router\Router;

// prefix scope
Router::prefix('/admin')->group(function (): void {
    Router::get('/dashboard', ...);    // /admin/dashboard
    Router::get('/settings', ...);     // /admin/settings
});

// middleware scope
Router::middleware([AuthMiddleware::class])->group(function (): void {
    Router::get('/account', ...);
});

// combined via group(): prefix, middleware (appended), and as (name prefix)
Router::group(
    ['prefix' => '/api/v1', 'middleware' => [ApiMiddleware::class], 'as' => 'api.'],
    function (): void {
        Router::get('/users', ...)->name('users');   // api.users, pattern /api/v1/users
    }
);
```

`prefix()` and `middleware()` return a `RouteGroup` (a readonly class wrapping
setup/cleanup callbacks); its `group(callable)` runs the callback between them and
returns its result. `Route` names are prefixed with the group `as` value at
construction and in `name()`.

## Inspecting routes

```php
use Omega\Router\Router;

Router::getRoutes();         // list<array> normalized definitions (Route::route())
Router::getRoutesRaw();      // Route[] instances
Router::getCurrent();        // ?Route matched by the last run()
Router::has('user.show');    // bool  (by name)
Router::redirect('user.show'); // Route  (by name, throws RouteNotFoundException)
Router::addRoutes([...]);    // push a raw definition
Router::removeRoutes('user.show');
Router::changeRoutes('user.show', new Route([...]));
Router::mergeRoutes([...]);
Router::reset();             // clear routes, handlers, group, patterns (defaults)
```

## Maps and attribute-based controllers

`Router::register(Class::class)` scans class and method attributes:

```php
use Omega\Router\Attribute\Route\Get;
use Omega\Router\Attribute\Middleware;
use Omega\Router\Attribute\Name;
use Omega\Router\Attribute\Prefix;
use Omega\Router\Attribute\Where;

#[Prefix('/admin')]
#[Name('admin.')]
#[Middleware([AuthMiddleware::class])]
final class AdminController
{
    #[Get('/dashboard')]
    #[Middleware([LogMiddleware::class])]
    #[Where(['id' => '\d+'])]
    #[Name('dashboard')]
    public function dashboard(int $id): mixed { return $id; }
}

Router::register(AdminController::class);   // or Router::register([A::class, B::class])
```

Available attributes: `#[Route\Get/Post/Put/Delete/Head/Option($expression)]`,
the generic `#[Route\Route(['GET','POST'], '/uri')]`, `#[Prefix]` (class),
`#[Name]` (class/method), `#[Middleware]` (class/method, method-level merges into
class-level), `#[Where]` (method). Class-level `Prefix` and `Name` are prepended
to each route's URI and name.

## Fallback handlers

```php
Router::pathNotFound(function (string $path): void {
    http_response_code(404);
});

Router::methodNotAllowed(function (string $path, string $method): void {
    http_response_code(405);
});
```

## Dispatching

`Router::run()` reads `$_SERVER['REQUEST_URI']` / `REQUEST_METHOD` (or takes
explicit `$uri`/`$method`), builds a `RouteDispatcher`, matches, runs middleware,
and invokes the handler:

```php
use Omega\Router\Router;

$result = Router::run(
    basePath: '/',
    caseMatters: false,
    trailingSlashMatters: false,
    multiMatch: false,
);
```

- `caseMatters`: default **false** (matching is case-insensitive).
- `trailingSlashMatters`: default **false** (trailing slashes are trimmed).
- `multiMatch`: default **false** (stop at the first match).
- `basePath`: a path prefix prepended to every route expression.

If the path matches but the method does not, `methodNotAllowed` fires; with no
path match, `pathNotFound` fires. On success, matched params are passed
positionally to the handler (named groups by name, otherwise by order), the
deduplicated middleware classes are each instantiated and their `handle()`
method invoked, and the handler's return value is returned.

Lower-level use of the dispatcher:

```php
use Omega\Router\RouteDispatcher;

$dispatcher = RouteDispatcher::dispatchFrom('/users/123', 'GET', Router::getRoutesRaw());
$dispatch = $dispatcher->basePath('/api')->caseMatters(true)->run(
    fn (callable $callable, array $params) => $callable(...$params),
    fn (string $path) => null,
    fn (string $path, string $method) => null,
);
// $dispatch === ['callable' => ..., 'params' => [...], 'middleware' => [...]]
$dispatcher->current();      // ?Route
```

`RouteDispatcher` is `final` and builds an internal `Omega\Http\Request` from the
URI and method.

## Generating URLs — `RouteUrlBuilder`

Builds URLs from a `Route` and parameters, validating values against the pattern
regex:

```php
use Omega\Router\RouteUrlBuilder;

$route   = Router::get('/users/(:id)/posts/(:slug)', ...)->where(['(:slug)' => '[a-z0-9-]+']);
$builder = new RouteUrlBuilder(Router::$patterns);   // standard aliases (:id), (:slug)

$builder->buildUrl($route, ['id' => 42, 'slug' => 'hello']);   // /users/42/posts/hello
$builder->buildUrl($route, [42, 'hello']);                     // positional also works
$builder->addPatterns(['(:token)' => '[A-Za-z0-9]{40}']);
$builder->getPatterns();
```

Validation failures and missing params throw the exceptions below.

## Service provider — `RouteServiceProvider`

Boots the web + schedule routes:

- `boot()`: registers web routes and requires the cron schedule
  (`routes/schedule.php`) **once per process** (guarded by a static flag).
- `registerWebRoutes()`: if a route cache exists at
  `getApplicationCachePath() . 'route.php'`, hydrates the cache; otherwise wraps
  `routes/web.php` in `Router::middleware([MaintenanceMiddleware::class])`.
  Re-run per request in persistent workers — the file uses `require` so it
  re-executes after `Router::reset()`.
- Cached routes with `SerializableClosure` callables are unserialized via
  `UnsignedSerializableClosure::getClosure()`.

## Exceptions

All under `Omega\Router\Exceptions`:

| Exception | When thrown |
| --------- | ----------- |
| `RouteNotFoundException` | `Router::redirect($name)` for an unknown route name |
| `RouteNotRegisteredException` | unsupported magic call on `Route` (`__call`) |
| `MissingRouteParameterException` | URL building with a missing parameter (`named()`, `namedIndexed()`, `patternAssoc()`, `patternIndexed()`) |
| `UnknownRoutePatternException` | URL building with an unknown pattern key |
| `PatternMismatchException` | URL building when a value fails its pattern (`forNamed()`, `forValue()`) |
| `RouteUrlNotFullyResolvedException` | unresolved placeholders remain in the generated URL |
| `InvalidRouteParameterException` | invalid parameter during URL building |

## Notes

- The router state is **static and process-wide**; call `Router::reset()` at the
  start of each request in a persistent worker (the service provider does this
  for web routes).
- There is **no** global `route()` helper and **no** `Route` facade; use
  `Router` directly and `RouteUrlBuilder` for URLs.
- Attributes live under `Omega\Router\Attribute` (`Route\*`, `Middleware`, `Name`,
  `Prefix`, `Where`).
- `RouteGroup` is `readonly`: create it via `prefix()`/`middleware()` or the
  internal callbacks, then call `->group($closure)`.

## Reference

- `Router.php`, `AbstractRouter.php`, `RouterInterface.php`
- `Route.php`, `RouteGroup.php`, `RouteDispatcher.php`, `RouteUrlBuilder.php`
- `RouteServiceProvider.php`, `Attribute/`
- `Exceptions/`
- Related: `Omega\Http\Request`, `Omega\Middleware\MaintenanceMiddleware`,
  `Omega\SerializableClosure\UnsignedSerializableClosure`
- Tests: `tests/Unit/Router/`
- License: GPL-3.0+