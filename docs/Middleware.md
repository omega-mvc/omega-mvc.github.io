# Omega MVC — Middleware Package Manual

The `Omega\Middleware` package provides built-in HTTP middleware classes that hook
into the request/response pipeline. Each middleware follows the same contract:
accept a `Request`, call `$next($request)`, and return a `Response`. Middleware
classes are instantiated by the router during dispatch, resolved from the
application container.

## Middleware contract

Every middleware must expose a `handle` method with this signature:

```php
use Closure;
use Omega\Http\Request;
use Omega\Http\Response;

public function handle(Request $request, Closure $next): Response
```

The middleware receives the incoming request, performs its work (or delegates to
the next handler via `$next`), and returns a `Response`. Returning early without
calling `$next` short-circuits the pipeline.

## Built-in middleware

| Middleware | Namespace | Purpose |
| ---------- | --------- | ------- |
| `CsrfMiddleware` | `Omega\Middleware` | Validates CSRF tokens on state-changing requests |
| `StartSessionMiddleware` | `Omega\Middleware` | Starts and persists the session per request |
| `ThrottleMiddleware` | `Omega\Middleware` | Rate-limits requests by client IP |
| `MaintenanceMiddleware` | `Omega\Middleware` | Blocks requests when the app is in maintenance mode |

### CsrfMiddleware

Requires a `CsrfInterface` implementation. Validates the CSRF token on `POST`,
`PUT`, `PATCH`, and `DELETE` requests. `GET`, `HEAD`, and `OPTIONS` are passed
through without validation.

```php
use Omega\Middleware\CsrfMiddleware;

$middleware = new CsrfMiddleware($csrf);
$response  = $middleware->handle($request, $next);
```

Throws `InvalidCsrfTokenException` when the token is missing or invalid on a
state-changing request. Throws `InvalidArgumentException` if the next handler
does not return a `Response` instance.

### StartSessionMiddleware

Requires a `SessionManager` instance. Calls `$session->start()` before the
request is handled and `$session->save()` after the response is produced.

```php
use Omega\Middleware\StartSessionMiddleware;

$middleware = new StartSessionMiddleware($sessionManager);
$response  = $middleware->handle($request, $next);
```

### ThrottleMiddleware

Requires a `RateLimiterInterface` instance. Limits the number of requests a
client can make within a time window. The key is derived from the client IP
address (`sha1($ip)`). Default limits: 60 attempts per 60-second window.

```php
use Omega\Middleware\ThrottleMiddleware;

$middleware = new ThrottleMiddleware($rateLimiter);
$response  = $middleware->handle($request, $next);
```

When blocked, returns an HTTP 429 response with headers:

| Header | Description |
| ------ | ----------- |
| `X-RateLimit-Limit` | Maximum allowed attempts |
| `X-RateLimit-Remaining` | Remaining attempts (0 when blocked) |
| `Retry-After` | Seconds until the rate limit resets (only on 429) |

### MaintenanceMiddleware

Requires an `ApplicationInterface` instance. Checks whether the application is
in maintenance mode via `isDownMaintenanceMode()`. When active:

1. If the maintenance data contains a `redirect` URL, the client is redirected.
2. If a `template` is defined, a 503 response with the template body is
   returned (with an optional `Retry-After` header).
3. Otherwise, an `HttpException` with status 503 is thrown.

When maintenance mode is off, the request is passed to the next handler.

```php
use Omega\Middleware\MaintenanceMiddleware;

$middleware = new MaintenanceMiddleware($app);
$response  = $middleware->handle($request, $next);
```

## Registering middleware

### Global middleware (via route groups)

Middleware applied to all routes within a group:

```php
use Omega\Router\Router;
use Omega\Middleware\StartSessionMiddleware;

Router::middleware([StartSessionMiddleware::class])->group(function (): void {
    Router::get('/dashboard', fn () => 'dashboard');
});
```

### Route-level middleware (via attribute)

Use the `#[Middleware]` attribute on a controller class or individual method:

```php
use Omega\Router\Attribute\Middleware;
use Omega\Middleware\ThrottleMiddleware;

#[Middleware([ThrottleMiddleware::class])]
final class LoginController
{
    #[Middleware([CsrfMiddleware::class])]
    public function store(): string { /* ... */ }
}
```

Method-level middleware is merged into class-level middleware. The attribute is
defined at `Omega\Router\Attribute\Middleware` and accepts an array of
middleware class names.

### Route-level middleware (via fluent API)

```php
Router::post('/login', 'LoginController@store')
    ->middleware([CsrfMiddleware::class]);
```

## Exceptions

| Exception | Namespace | Thrown when |
| --------- | --------- | ----------- |
| `InvalidCsrfTokenException` | `Omega\Csrf\Exceptions` | CSRF token is missing or invalid |
| `InvalidArgumentException` | `InvalidArgumentException` | Middleware handler does not return a `Response` |
| `HttpException` | `Omega\Http\Exceptions` | Maintenance mode with no redirect or template |

## Notes

- Middleware classes are resolved from the container by the router during
  dispatch; constructor dependencies are autowired automatically.
- `ThrottleMiddleware` defaults to 60 requests per 60 seconds. The
  `RateLimiterServiceProvider` registers this as the default binding.
- `MaintenanceMiddleware` reads the maintenance flag from the application
  storage directory (`storage/app/down` and `storage/app/maintenance.php`).

## Reference

- `CsrfMiddleware.php`, `StartSessionMiddleware.php`, `ThrottleMiddleware.php`, `MaintenanceMiddleware.php`
- Related: `Omega\Router\Attribute\Middleware`, `Omega\RateLimiter\RateLimiterInterface`
- Tests: `tests/Unit/Middleware/`
- License: GPL-3.0+
