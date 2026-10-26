# Omega MVC — Environment Package Manual

The `Omega\Environment` package loads environment variables from `.env` files and provides
automatic type casting for common values (`true`, `false`, `null`, numeric strings). It
also exposes helper functions for querying the current application environment.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

The `vlucas/phpdotenv` package is required as a dependency for `.env` file parsing.

## Configuration

Place a `.env` file at the project root (or the directory passed to `Env::load()`):

```env
APP_ENV=production
APP_DEBUG=false
DB_PORT=3306
APP_NAME=Omega
```

## Env class

`Env` is a static class that manages environment variable loading and retrieval.

```php
use Omega\Environment\Env;

// Load from a path
Env::load(BASE_PATH, '.env');

// Retrieve with automatic casting
$debug = Env::get('APP_DEBUG');     // false (boolean)
$port  = Env::get('DB_PORT');       // 3306 (int)
$name  = Env::get('APP_NAME');      // 'Omega' (string)
$admin = Env::get('ADMIN', false);  // false (default)
```

### API reference — Env

| Method | Return | Description |
| ------ | ------ | ----------- |
| `load(string $path, string $file = '.env'): void` | `void` | Load environment variables from a `.env` file |
| `get(string $key, mixed $default = null): mixed` | `mixed` | Retrieve a variable with automatic type casting |

### Type casting rules

| String value | PHP type |
| ------------ | -------- |
| `"true"` or `"(true)"` | `true` (bool) |
| `"false"` or `"(false)"` | `false` (bool) |
| `"null"` or `"(null)"` | `null` |
| `"empty"` or `"(empty)"` | `''` (empty string) |
| `"123"` | `123` (int) |
| `"3.14"` | `3.14` (float) |
| `"hello"` | `"hello"` (string, unchanged) |

### Value resolution order

1. Internally loaded values (from `Env::load()`)
2. System environment variables (`getenv()`)
3. The provided default value

## Helper functions

The following global functions are available when the package is autoloaded via Composer
files autoloading.

### env()

```php
env(string $key, mixed $default = null): mixed
```

Retrieve an environment variable by key. Delegates to `Env::get()` with automatic
type casting.

```php
$appEnv = env('APP_ENV', 'production'); // 'production'
$debug  = env('APP_DEBUG');              // false
```

### is_production()

```php
is_production(): bool
```

Returns `true` when `APP_ENV` equals `production`.

### is_testing()

```php
is_testing(): bool
```

Returns `true` when `APP_ENV` equals `testing`.

### is_local()

```php
is_local(): bool
```

Returns `true` when `APP_ENV` equals `local`.

### is_development()

```php
is_development(): bool
```

Returns `true` when `APP_ENV` equals `development`.

## Environment detection

The framework determines the running environment through the `APP_ENV` variable. The
`is_testing()` function is used by the bootstrapping layer to conditionally register
error handlers and disable error display outside test mode:

```php
// In HandleExceptions bootstrap:
if ('testing' !== $app->getEnvironment()) {
    set_error_handler([$this, 'handleError']);
    set_exception_handler([$this, 'handleException']);
}
```

The `ExceptionHandler` also consults the environment to decide whether to render a full
debug response or a generic 500 page:

```php
// Production: renders a generic error page
// Non-production: throws the exception for Whoops to handle
private function isProduction(): bool
{
    return $this->app->get('environment') === 'prod';
}
```

## Exceptions

| Exception | Thrown when |
| --------- | ----------- |
| (none directly) | The package relies on `Dotenv` exceptions for invalid `.env` files |

## Reference

- Source: `src/Omega/Environment/`
- Tests: `tests/Unit/Environment/`
- License: GPL-3.0+
