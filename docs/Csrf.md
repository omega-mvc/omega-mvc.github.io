# Omega MVC — Csrf Package Manual

The `Omega\Csrf` package provides Cross-Site Request Forgery protection via
session-backed tokens. It includes a `CsrfInterface` contract, a `Csrf`
implementation, a service provider that wires the container and registers a
view directive, a `CsrfMiddleware` that validates tokens on state-changing
requests, and a `Csrf` facade for static access.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

The CSRF system depends on `Omega\Session\SessionManager` for token storage.

## CsrfInterface

```php
interface CsrfInterface
{
    public function generateToken(): string;
    public function validateToken(?string $token): bool;
    public function getToken(): string;
    public function getTokenField(): string;
    public function getTokenName(): string;
}
```

| Method | Description |
| ------ | ----------- |
| `generateToken()` | Create a new 64-character hex token, store it in the session, and return it. |
| `validateToken(?string $token)` | Compare the given token against the stored session token using `hash_equals()`. Returns `false` for null/empty input. |
| `getToken()` | Return the current session token, generating one if absent. |
| `getTokenField()` | Return the form field name: `_csrf_token`. |
| `getTokenName()` | Return the session key: `_csrf.token`. |

## Csrf implementation

`Csrf` implements `CsrfInterface` and delegates token storage to
`SessionManager`:

```php
use Omega\Csrf\Csrf;

$csrf = new Csrf($sessionManager);

$token = $csrf->generateToken();       // stored in session under '_csrf.token'
$valid = $csrf->validateToken($token); // true/false
$field = $csrf->getTokenField();       // '_csrf_token'
```

### Token generation

Tokens are 64-character hex strings produced by `bin2hex(random_bytes(32))`.
Each call to `generateToken()` replaces the previous token in the session.

### Validation

`validateToken()` uses timing-safe `hash_equals()` to compare the submitted
token against the stored value. Returns `false` when the input is null, empty,
or does not match.

## CsrfMiddleware

The middleware validates CSRF tokens on state-changing HTTP methods (anything
except GET, HEAD, OPTIONS):

```php
use Omega\Middleware\CsrfMiddleware;

$middleware = new CsrfMiddleware($csrf);
$response = $middleware->handle($request, $next);
```

For non-safe methods, the middleware reads the `_csrf_token` field from the POST
data and calls `validateToken()`. A missing or invalid token throws
`InvalidCsrfTokenException`. Safe methods (GET, HEAD, OPTIONS) pass through
without validation.

The middleware is included in the default HTTP middleware stack via
`Omega\Http\Http`.

## View directive

The service provider registers a `{% csrf() %}` template directive that
outputs a hidden input field:

```html
<form method="POST" action="/submit">
    {% csrf() %}
    <button type="submit">Submit</button>
</form>
```

Renders as:

```html
<input type="hidden" name="_csrf_token" value="a1b2c3...">
```

The directive resolves the `csrf` container binding, calls `getTokenField()` for
the field name and `getToken()` for the value. A new token is generated if one
does not exist in the session.

## CsrfServiceProvider

Registers the following container bindings:

| Binding | Resolves to | Description |
| ------- | ----------- | ----------- |
| `CsrfInterface::class` | `Csrf` | Depends on `SessionManager` from `'session'` binding. |
| `'csrf'` | `Csrf` | Alias that resolves `CsrfInterface::class` and type-checks the result. |

Also registers the `csrf` view directive with `DirectiveTemplator`.

Throws `RuntimeException` if the session service is unavailable.

## Facade

```php
use Omega\Csrf\Facade\Csrf;

$token = Csrf::getToken();
$field = Csrf::getTokenField();   // '_csrf_token'
$valid = Csrf::validateToken($submittedToken);
$newToken = Csrf::generateToken();
```

The `Csrf` facade resolves the `'csrf'` container binding.

## Exceptions

All under `Omega\Csrf\Exceptions`:

| Exception | When thrown |
| --------- | ----------- |
| `InvalidCsrfTokenException` | Token validation fails in `CsrfMiddleware` |
| `MalformedCsrfTokenException` | Token has an invalid format |

Both implement `CsrfTokenExceptionInterface` (which extends `\Throwable`).

## Notes

- The session key used for token storage is `_csrf.token` and the form field
  name is `_csrf_token`. These are fixed, not configurable.
- `CsrfMiddleware` is automatically included in the default HTTP middleware
  pipeline — all non-safe requests are protected by default.
- GET, HEAD, and OPTIONS requests are never validated.
- The `validateToken()` method consumes the submitted token but does **not**
  invalidate the session token; the same token can be validated multiple times
  within the session.
- There is no global `csrf()` helper function — use the `{% csrf() %}` template
  directive or the `Csrf` facade.

## Reference

- `CsrfInterface.php`, `Csrf.php`
- `CsrfServiceProvider.php`
- `Facade/Csrf.php` (accessor `'csrf'`)
- `Exceptions/CsrfTokenExceptionInterface.php`, `Exceptions/InvalidCsrfTokenException.php`,
  `Exceptions/MalformedCsrfTokenException.php`
- Middleware: `Middleware/CsrfMiddleware.php`
- Tests: `tests/Unit/Csrf/`
- Dependencies: `Omega\Session\SessionManager`, `Omega\View\Templator\DirectiveTemplator`
- License: GPL-3.0+
