# Omega MVC — Http Package Manual

The `Omega\Http` package provides the full HTTP layer: request encapsulation, response
building, middleware pipeline execution, JSON/redirect/streamed responses, file uploads,
header management, URL parsing, and RoadRunner persistent-worker integration. It also
includes PSR-7 bridge adapters.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

## Http kernel

`Http` is the central kernel that handles the full HTTP request/response lifecycle:
bootstrapping, route dispatch, middleware execution, exception handling, and termination.

```php
use Omega\Http\Http;
use Omega\Http\Request;
use Omega\Http\Response;

$kernel  = new Http($app);
$request = RequestFactory::capture();

$response = $kernel->handle($request);
$response->send();

$kernel->terminate($request, $response);
```

### API reference — Http

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(ApplicationInterface $app)` | — | Inject the application container |
| `handle(Request $request): Response` | `Response` | Process a request through bootstrap, dispatch, and middleware |
| `bootstrap(): void` | `void` | Execute registered bootstrapper classes |
| `terminate(Request $request, Response $response): void` | `void` | Run terminate callbacks on middleware, then reset per-request state |

### Bootstrappers

Executed in order during `bootstrap()`:

| Bootstrapper | Purpose |
| ------------ | ------- |
| `ConfigBootstrapper` | Load application configuration |
| `HandleExceptions` | Register error/exception/shutdown handlers |
| `FacadeBootstrapper` | Initialize facade bindings |
| `RegisterProviders` | Register service providers |
| `BootProviders` | Boot registered service providers |

### Global middleware

Applied to every request by default:

| Middleware | Purpose |
| --------- | ------- |
| `MaintenanceMiddleware` | Check maintenance mode |
| `StartSessionMiddleware` | Start session for the request |
| `CsrfMiddleware` | CSRF token validation |

### Middleware pipeline

Middleware is executed in reverse order (onion model). Each middleware must expose a
`handle(Request $request, callable $next): Response` method:

```php
class MyMiddleware
{
    public function handle(Request $request, callable $next): Response
    {
        // Before logic
        $response = $next($request);
        // After logic
        return $response;
    }
}
```

The `terminate()` method is called on each middleware after the response has been sent,
allowing cleanup work:

```php
class MyMiddleware
{
    public function terminate(Request $request, Response $response): void
    {
        // Post-response cleanup
    }
}
```

### Persistent worker support

`Http` marks the request as request-scoped via `setRequestScoped()`. The
`resetForRequest()` method clears request-scoped container state, rolls back
dangling database transactions, and resets static Router/Facade state between
requests in persistent workers (e.g. RoadRunner).

## Request

`Request` encapsulates all aspects of an HTTP request. Implements `ArrayAccess`
and `IteratorAggregate` for convenient input access.

```php
$request = RequestFactory::capture();

// Access input
$value = $request->input('name');
$query = $request->getQuery('page');
$post  = $request->getPost('email');

// Array access
$value = $request['name'];

// JSON body
$json = $request->json();

// Headers
$auth = $request->getAuthorization();
$token = $request->getBearerToken();

// Request properties
$method = $request->getMethod();       // GET, POST, etc.
$url    = $request->getUrl();
$ip     = $request->getRemoteAddress();
$isJson = $request->isJson();
$isAjax = $request->isAjax();
$isHttps = $request->isSecured();
```

### API reference — Request

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(string $url, array $query, array $post, ...)` | — | Create a new request |
| `initialize(...): self` | `self` | Re-initialize all request data |
| `duplicate(?array $query, ?array $post, ...): self` | `self` | Clone with optional overrides |
| `getUrl(): string` | `string` | Get the requested URL |
| `getQuery(?string $key = null): array\|string` | `array\|string` | Get `$_GET` values |
| `getPost(?string $key = null): array\|string` | `array\|string` | Get `$_POST` values |
| `getFile(?string $key = null): array` | `array` | Get uploaded files |
| `getCookie(string $key): ?string` | `?string` | Get a cookie value |
| `getCookies(): ?array` | `?array` | Get all cookies |
| `getMethod(): string` | `string` | Get the HTTP method (uppercase) |
| `isMethod(string $method): bool` | `bool` | Check the HTTP method |
| `getHeaders(?string $header = null): array\|string\|null` | `mixed` | Get request headers |
| `getMimeTypes(string $format): array` | `array` | Get MIME types for a format |
| `getFormat(?string $mimeType): ?string` | `?string` | Get format for a MIME type |
| `getRequestFormat(): ?string` | `?string` | Detect format from Content-Type |
| `isHeader(string $headerKey, string $headerVal): bool` | `bool` | Check header value |
| `hasHeader(string $header_key): bool` | `bool` | Check header existence |
| `isSecured(): bool` | `bool` | Check HTTPS |
| `getRemoteAddress(): string` | `string` | Get client IP |
| `getRawBody(): ?string` | `?string` | Get raw request body |
| `getJsonBody(): array` | `array` | Decode JSON body as array |
| `getAttribute(string $key, mixed $default): mixed` | `mixed` | Get a custom attribute |
| `with(array $pushAttributes): self` | `self` | Merge custom attributes |
| `all(): array` | `array` | Get all request data merged |
| `wrap(): array` | `array` | Get all data in a single-element array |
| `isAjax(): bool` | `bool` | Check XMLHttpRequest header |
| `isJson(): bool` | `bool` | Check JSON content type |
| `json(): Collection` | `Collection` | Get JSON body as a Collection |
| `getAuthorization(): ?string` | `?string` | Get Authorization header |
| `getBearerToken(): ?string` | `?string` | Extract Bearer token |
| `input(?string $key = null, ?string $default = null): Collection\|string` | `mixed` | Get input (auto-detects source) |
| `query(): CollectionImmutable` | `CollectionImmutable` | Immutable query collection |
| `post(): CollectionImmutable` | `CollectionImmutable` | Immutable POST collection |

### Magic property access

`Request` implements `__get()` to read input values dynamically:

```php
$page = $request->query_1; // equivalent to $request->input('query_1')
```

### Macro methods

`Request` uses `MacroableTrait`. The following macros are registered by
`MacroServiceProvider`:

| Method | Return | Description |
| ------ | ------ | ----------- |
| `validate(?Closure $rule, ?Closure $filter): Validator` | `Validator` | Run validation against all input data |
| `upload(string $fileName): UploadFile` | `UploadFile` | Retrieve an uploaded file by input name |

```php
// Validate all input
$validator = $request->validate(function ($rule) {
    $rule->field('email')->required()->email();
    $rule->field('name')->required()->min(3);
});

// Retrieve an uploaded file
$file = $request->upload('avatar');
$file->setFolderLocation(storage_path('uploads/'));
$file->setFileTypes(['jpg', 'jpeg', 'png']);
$file->setMaxFileSize(2_000_000);
$destination = $file->upload();
```

## Response

`Response` represents an HTTP response with status code, headers, content, and
protocol version.

```php
$response = new Response('Hello, world!', 200);
$response->send();

// JSON response
$response = new Response(['message' => 'ok']);
$response->json()->send();

// Redirect
$response = new Response();
$response->setResponseCode(302);
$response->header('Location', '/dashboard');
$response->send();
```

### Status code constants

| Constant | Value |
| -------- | ----- |
| `HTTP_OK` | `200` |
| `HTTP_CREATED` | `201` |
| `HTTP_ACCEPTED` | `202` |
| `HTTP_NO_CONTENT` | `204` |
| `HTTP_MOVED_PERMANENTLY` | `301` |
| `HTTP_BAD_REQUEST` | `400` |
| `HTTP_UNAUTHORIZED` | `401` |
| `HTTP_FORBIDDEN` | `403` |
| `HTTP_NOT_FOUND` | `404` |
| `HTTP_METHOD_NOT_ALLOWED` | `405` |

### API reference — Response

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(array\|string $content = '', int $responseCode = 200, array $headers = [])` | — | Create a response |
| `send(): self` | `self` | Send headers and content to the client |
| `json(array\|string\|null $content = null): self` | `self` | Set content type to JSON |
| `html(bool $minify = false): self` | `self` | Set content type to HTML (optional minification) |
| `plainText(): self` | `self` | Set content type to plain text |
| `setContent(string\|array $content): self` | `self` | Set response content |
| `setResponseCode(int $responseCode): self` | `self` | Set the HTTP status code |
| `setHeaders(array $headers): self` | `self` | Replace all headers |
| `setProtocolVersion(string $version): self` | `self` | Set HTTP version |
| `setContentType(string $contentType): self` | `self` | Set Content-Type header |
| `header(string $header, ?string $value = null): self` | `self` | Add/set a header |
| `getHeaders(): array` | `array` | Get all headers |
| `getStatusCode(): int` | `int` | Get the status code |
| `getContent(): string\|array` | `mixed` | Get response content |
| `getProtocolVersion(): string` | `string` | Get HTTP version |
| `getContentType(): string` | `string` | Get Content-Type |
| `followRequest(Request $request, array $headerName = []): self` | `self` | Copy headers from a request |
| `removeHeader(string\|array $headers): self` | `self` | Mark headers for removal |
| `removeHeaders(array $headers): self` | `self` | Mark multiple headers for removal |
| `removeDefaultHeader(bool $removeDefaultHeader): self` | `self` | Remove default server headers |
| `isInformational(): bool` | `bool` | Check if 1xx |
| `isSuccessful(): bool` | `bool` | Check if 2xx |
| `isRedirection(): bool` | `bool` | Check if 3xx |
| `isClientError(): bool` | `bool` | Check if 4xx |
| `isServerError(): bool` | `bool` | Check if 5xx |
| `close(): void` | `void` | Exit the application |

### Static methods

| Method | Description |
| ------ | ----------- |
| `closeOutputBuffers(int $targetLevel, bool $flush): void` | Flush or clean output buffers to a target level |

## JsonResponse

Extends `Response`. Automatically encodes data to JSON and sets the `Content-Type`
header.

```php
use Omega\Http\JsonResponse;

$response = new JsonResponse(['status' => 'ok'], 200);
$response->setEncodingOptions(JSON_PRETTY_PRINT);
$response->send();
```

### API reference — JsonResponse

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(?array $data = null, int $statusCode = 200, array $headers = [])` | — | Create a JSON response |
| `setEncodingOptions(int $encodingOptions): self` | `self` | Set JSON encoding options |
| `getEncodingOptions(): int` | `int` | Get encoding options |
| `setJson(string $json): self` | `self` | Set raw JSON string |
| `setData(mixed $data): self` | `self` | Encode data as JSON |
| `getData(): array` | `array` | Get decoded JSON data |

## RedirectResponse

Extends `Response`. Sets the `Location` header and generates an HTML page with a
meta-refresh redirect.

```php
use Omega\Http\RedirectResponse;

$response = new RedirectResponse('/dashboard');
// $response->send();
```

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(string $url, int $responseCode = 302, array $headers = [])` | — | Create a redirect response |
| `setTarget(string $url): void` | `void` | Update the redirect URL |

## StreamedResponse

Extends `Response`. Streams content to the client via a callback, useful for large
files or real-time output.

```php
use Omega\Http\StreamedResponse;

$response = new StreamedResponse(function () {
    echo "Line 1\n";
    flush();
    echo "Line 2\n";
    flush();
});
$response->send();
```

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(?callable $callableStream, int $responseCode = 200, array $headers = [])` | — | Create a streamed response |
| `setStream(?callable $callableStream): self` | `self` | Set/replace the stream callback |

## HeaderCollection

Extends `Collection`. Manages HTTP headers with support for parsing, modifying, and
rendering directive values (e.g. `Cache-Control: max-age=3600, public`).

```php
use Omega\Http\HeaderCollection;

$headers = new HeaderCollection(['Content-Type' => 'text/html']);
$headers->set('X-Custom', 'value');
$headers->addDirective('Cache-Control', ['max-age' => '3600']);
$raw = (string) $headers; // "Content-Type: text/html\r\nX-Custom: value\r\n..."
```

### API reference — HeaderCollection

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__toString(): string` | `string` | Render as raw HTTP header string |
| `setRaw(string $header): self` | `self` | Parse and set a raw `"Name: value"` header |
| `getDirective(string $header): array` | `array` | Parse a header into directives |
| `addDirective(string $header, array $value): self` | `self` | Add directives to a header |
| `removeDirective(string $header, string $item): self` | `self` | Remove a directive from a header |
| `hasDirective(string $header, string $item): bool` | `bool` | Check if a directive exists |

## Url

Parses a URL string and provides typed access to its components.

```php
use Omega\Http\Url;

$url = Url::parse('https://user:pass@example.com:8080/path?q=1#section');
$url->schema();    // 'https'
$url->host();      // 'example.com'
$url->port();      // 8080
$url->user();      // 'user'
$url->password();  // 'pass'
$url->path();      // '/path'
$url->query();     // ['q' => '1']
$url->fragment();  // 'section'

// From a Request
$url = Url::fromRequest($request);
```

## Helper functions

| Function | Description |
| -------- | ----------- |
| `redirect(string $url): RedirectResponse` | Create a redirect response to a URL |
| `redirect_route(string $route_name, array $parameter = []): RedirectResponse` | Redirect to a named route |

## RequestFactory

Factory for creating `Request` instances from PHP globals or PSR-7 objects.

```php
use Omega\Http\RequestFactory;

// From PHP superglobals
$request = RequestFactory::capture();

// From PSR-7 (RoadRunner, etc.)
$request = RequestFactory::fromPsr7ServerRequest($psr7Request);
```

| Method | Return | Description |
| ------ | ------ | ----------- |
| `capture(): Request` | `Request` | Build a Request from `$_GET`, `$_POST`, etc. |
| `fromPsr7ServerRequest(ServerRequestInterface $psr7): Request` | `Request` | Build a Request from a PSR-7 object |

## ResponseFactory

Converts an Omega `Response` into a PSR-7 `ResponseInterface`.

```php
use Omega\Http\ResponseFactory;

$psr7 = ResponseFactory::toPsr7($response, $psr7Factory, $streamFactory);
```

## RoadRunner integration

### RoadRunnerWorker

Bridges the Omega `Http` kernel to a RoadRunner persistent worker. Each PSR-7
request is converted to an Omega `Request`, handled, converted back to a PSR-7
response, and sent to the client.

```php
use Omega\Http\Http;
use Omega\Http\RoadRunnerWorker;

$worker = new RoadRunnerWorker(
    $http,
    psr7Factory: $psr17Factory,
    streamFactory: $psr17StreamFactory
);

$worker->run($responder);
```

### RoadRunnerResponderInterface

Contract for the RoadRunner PSR-7 responder (canonical implementation:
`Spiral\RoadRunner\Http\PSR7Worker`).

| Method | Description |
| ------ | ----------- |
| `waitRequest(): ServerRequestInterface\|false\|null` | Wait for the next request |
| `respond(ResponseInterface $response): void` | Send a response back to the client |

## File uploads

### UploadFile (single file)

```php
use Omega\Http\Upload\UploadFile;

$file = new UploadFile($_FILES['avatar']);
$file->setFolderLocation(storage_path('uploads/'));
$file->setFileName('profile');
$file->setFileTypes(['jpg', 'jpeg', 'png']);
$file->setMaxFileSize(2_000_000);

$destination = $file->upload(); // string path or empty string on failure
$content     = $file->get();    // file contents (after successful upload)
$success     = $file->success();
$error       = $file->getError();
```

### UploadMultiFile (multiple files)

```php
use Omega\Http\Upload\UploadMultiFile;

$files = new UploadMultiFile($_FILES['documents']);
$files->setFolderLocation(storage_path('uploads/'));
$files->setFileName('doc');
$files->setFileTypes(['pdf', 'docx']);
$files->setMaxFileSize(5_000_000);

$destinations = $files->uploads(); // string[] of paths
$contents     = $files->getAll();  // string[] of contents
```

### AbstractUpload API

| Method | Description |
| ------ | ----------- |
| `success(): bool` | Whether the upload succeeded |
| `getError(): string` | Human-readable error message |
| `getFileTypes(): array` | Allowed file extensions |
| `setFileName(string $fileName): self` | Set base file name (without extension) |
| `setFolderLocation(string $folderLocation): self` | Set destination directory |
| `setFileTypes(array $extensions): self` | Set allowed extensions |
| `setMimeTypes(array $mimes): self` | Set allowed MIME types |
| `setMaxFileSize(int $byte): self` | Set max file size in bytes |
| `markTest(bool $markUploadTest): self` | Enable test mode (uses `copy()` instead of `move_uploaded_file()`) |
| `delete(string $url): bool` | Delete a file from disk |
| `creatFolder(string $path): bool` | Create a directory recursively |

## Exceptions

| Exception | Base class | Thrown when |
| --------- | ---------- | ----------- |
| `HttpException` | `RuntimeException` | HTTP error with status code, message, and optional headers |
| `HttpResponseException` | `RuntimeException` | A `Response` object is returned as an exception |
| `FileNotUploadedException` | `RuntimeException` | Attempting to read a file that was not uploaded |
| `FileNotExistsException` | `InvalidArgumentException` | Referenced file does not exist on disk |
| `FolderNotExistsException` | `InvalidArgumentException` | Referenced folder does not exist on disk |
| `MultiFileUploadDetectException` | `InvalidArgumentException` | Multi-file data passed to `UploadFile` instead of `UploadMultiFile` |
| `StreamedResponseCallableException` | `Exception` | `StreamedResponse` invoked without a callback |

### HttpException

```php
use Omega\Http\Exceptions\HttpException;

throw new HttpException(
    statusCode: 422,
    message: 'Validation failed',
    previous: null,
    headers: ['X-Error-Field' => 'email']
);

// Accessible via:
$e->getStatusCode(); // 422
$e->getHeaders();    // ['X-Error-Field' => 'email']
```

## Notes

- `Response::send()` calls `fastcgi_finish_request()` or `litespeed_finish_request()`
  when available, to finalize the connection before running terminate callbacks.
- `Request` implements `ArrayAccess` using the input source (query, post, or JSON body),
  so `$request['key']` works seamlessly.
- `RequestFactory::fromPsr7ServerRequest()` supports method override via the
  `X-HTTP-Method-Override` header on POST requests.
- Upload classes default to `jpg`/`jpeg`/`png` extensions and 50 KB max size; always
  configure these before calling `upload()`.

## Reference

- Source: `src/Omega/Http/`
- Tests: `tests/Unit/Http/`
- License: GPL-3.0+
