# Omega MVC — Exceptions Package Manual

The `Omega\Exceptions` package provides the application-wide exception handling layer. It
includes an `ExceptionHandler` for rendering and reporting errors, a `HandleExceptions`
bootstrapper that registers PHP error/exception/shutdown handlers, and a `WhoopsServiceProvider`
for debug-mode integration with the Whoops error handler.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

## ExceptionHandler

The `ExceptionHandler` is the central component that converts thrown exceptions into
HTTP responses and writes them to the application log.

```php
use Omega\Exceptions\ExceptionHandler;
use Omega\Http\Request;
use Omega\Http\Response;

$handler = new ExceptionHandler($app);

// Log the exception
$handler->report($exception);

// Render to an HTTP response
$response = $handler->render($request, $exception);
$response->send();
```

### API reference — ExceptionHandler

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(ApplicationInterface $application)` | — | Inject the application container |
| `report(Throwable $th): void` | `void` | Log the exception (skips "do not report" types) |
| `render(Request $request, Throwable $th): Response` | `Response` | Convert exception to an HTTP response |
| `registerViewPath(): Templator` | `Templator` | Build a `Templator` for error page templates |

### Rendering behavior

The `render()` method follows this decision tree:

1. **JSON request** — Returns a JSON response with error details (debug) or a generic
   500 message (production).
2. **`HttpResponseException`** — Returns the embedded `Response` object directly.
3. **`HttpException`** — Renders a view template matching the status code (e.g. `404.php`),
   falling back to `500.php` if the template does not exist.
4. **Non-debug mode** — Returns a generic error response (production: generic 500 page;
   non-production: exception message as text).
5. **Debug mode** — Re-throws the exception for Whoops to handle.

### Reporting behavior

Exceptions are logged to the `logging` service at these PSR-3 levels:

| Condition | Log level |
| --------- | --------- |
| `HttpException` with status >= 500 | `CRITICAL` |
| All other exceptions | `ERROR` |

After logging, the handler dispatches an `ExceptionEvent` through the event dispatcher
(if available in the container).

### Do-not-report list

The following exception types are silently skipped by `report()`:

- `HttpResponseException`
- `HttpException`

You can extend the `$dontReport` array in a subclass to suppress additional types.

## HandleExceptions

The `HandleExceptions` bootstrapper is executed during the application bootstrap phase.
It registers PHP's error, exception, and shutdown handlers.

```php
use Omega\Exceptions\Bootstrapper\HandleExceptions;

$bootstrapper = new HandleExceptions();
$bootstrapper->bootstrap($app);
```

### API reference — HandleExceptions

| Method | Return | Description |
| ------ | ------ | ----------- |
| `bootstrap(ApplicationInterface $app): void` | `void` | Register error/exception/shutdown handlers |
| `handleError(int $level, string $message, string $file, int $line): bool` | `bool` | Convert PHP errors to `ErrorException` |
| `handleException(Throwable $th): void` | `void` | Report and render uncaught exceptions |
| `handleShutdown(): void` | `void` | Check for fatal errors on shutdown |
| `resetHandlersState(): void` | `void` | Reset static state (testing helper) |

### Bootstrap behavior

- Sets `error_reporting(E_ALL)`.
- Reserves 32 KB of memory to handle fatal errors gracefully.
- Registers custom `set_error_handler`, `set_exception_handler`, and
  `register_shutdown_function`.
- Disables `display_errors` in all environments except `testing`.

### Error level mapping

| PHP error level | PSR-3 log level |
| --------------- | --------------- |
| `E_DEPRECATED`, `E_USER_DEPRECATED` | `NOTICE` |
| `E_ERROR`, `E_CORE_ERROR`, `E_COMPILE_ERROR`, `E_PARSE` | `CRITICAL` |
| Other errors | `ERROR` |

### Shutdown handling

`handleShutdown()` calls `error_get_last()` and wraps fatal errors
(`E_ERROR`, `E_CORE_ERROR`, `E_COMPILE_ERROR`, `E_PARSE`) in an `ErrorException`,
then delegates them to `handleException()`.

## WhoopsServiceProvider

Registers Whoops page handlers when the application is in debug mode. Requires the
`filp/whoops` package to be installed.

```php
use Omega\Exceptions\WhoopsServiceProvider;

// Registered automatically as a service provider
// Provides:
//   'error.handle'              => Whoops\Run
//   'error.PrettyPageHandler'   => Whoops\Handler\PrettyPageHandler
//   'error.PlainTextHandler'    => Whoops\Handler\PlainTextHandler
```

### Registration

The provider only bootstraps when:
- `$app->isDebugMode()` returns `true`
- `Whoops\Run` class exists

The Whoops handlers are registered in the container and can be retrieved by
application-level code to configure page handler settings (editor, title, etc.).

## ExceptionEvent

When an exception is logged, the `ExceptionHandler` dispatches an `ExceptionEvent`
through the event dispatcher (if registered). This allows application code to react
to exceptions without modifying the handler.

```php
use Omega\Event\Events\ExceptionEvent;

$events->listen(ExceptionEvent::class, function (ExceptionEvent $event) {
    $exception = $event->getThrowable();
    $level     = $event->getLevel();
    // custom notification logic...
});
```

## ApplicationNotAvailableException

A `RuntimeException` thrown when the application container is accessed before it has
been initialized. Primarily used as a safeguard in the `app()` helper function and
during testing.

```php
throw new ApplicationNotAvailableException();
// Message: "Application not start yet!"
```

## Exceptions

| Exception | Base class | Thrown when |
| --------- | ---------- | ----------- |
| `ApplicationNotAvailableException` | `RuntimeException` | Application accessed before initialization |

## Reference

- Source: `src/Omega/Exceptions/`
- Tests: `tests/Unit/Exceptions/`
- License: GPL-3.0+
