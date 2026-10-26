# Omega MVC — Testing Package Manual

The `Omega\Testing` package provides the tooling to write application tests with
Pest/PHPUnit against a real Omega `Application`. It supplies a `TestCase` base
class with HTTP verbs, the `TestResponse`/`TestJsonResponse` assertion wrappers,
and a `ResponseStatusTrait`. It builds on the `Omega\Application`, `Omega\Http`,
`Omega\Container` and `Omega\Facade` packages.

## Test case — `TestCase`

`TestCase extends PHPUnit\Framework\TestCase`. Set up an `Application` in your
`beforeEach` and bind the `Http` kernel:

```php
use Omega\Application\Application;
use Omega\Http\Http;
use Omega\Testing\TestCase;

class MyFeatureTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->app = new Application(basePath: dirname(__DIR__));
        $this->app->set(Http::class, fn () => new Http($this->app));
    }
}
```

`tearDown()` flushes the container, all facades, and service-provider module state
so nothing leaks between tests.

### Request helpers

| Method | Returns | Purpose |
| ------ | ------- | ------- |
| `call($url, $query, $post, $attributes, $cookies, $files, $headers, $method = 'GET', $remoteAddress = '::1', $rawBody)` | `TestResponse` | build a `Request`, run it through the `Http` kernel, terminate, wrap the result |
| `get($url, $parameter = [])` | `TestResponse` | HTTP GET |
| `post($url, $post, $files = [])` | `TestResponse` | HTTP POST |
| `put($url, $put, $files = [])` | `TestResponse` | HTTP PUT (payload goes in request attributes) |
| `delete($url, $delete)` | `TestResponse` | HTTP DELETE |
| `json($call, $params = [])` | `TestJsonResponse` | invoke a service via the container `call()` and wrap its array result |

`call()` returns any `Throwable` from the kernel; `json()` throws `Exception`
(`Response body is not Array.`) when the callable does not return an array. In
`json()`, a `code` key sets the response status code and a `headers` key sets
response headers:

```php
$response = $this->json(fn (): array => [
    'status'  => 'ok',
    'code'    => 201,
    'headers' => ['X-Test' => 'value'],
]);
```

## `TestResponse`

A read-only wrapper around `Omega\Http\Response` that exposes assertions and
array access over the decoded body.

```php
$response = $this->get('/users');

$response->assertOk();
$response->assertStatusCode(200);
$response->assertSee('<h1>Users</h1>');
$response->getContent();            // raw/encoded body string
$response->getResponse();           // the underlying Response
$response['data'];                  // ArrayAccess over decoded body
```

Implements `ArrayAccess` (`offsetExists`/`offsetGet`); writes and unsets throw a
`LogicException` (`TestResponse is read-only.`).

| Method | Asserts |
| ------ | ------- |
| `assertSee(string $text, string $message = '')` | body contains the substring |
| `assertStatusCode(int $code, string $message = '')` | exact HTTP status code |
| `getContent(): string` | raw response content |

## `TestJsonResponse`

`TestJsonResponse extends TestResponse` and adds an indexable, **mutable** view of
an array response body plus `data`-aware assertions. `assertEquals()` and friends
resolve keys with `data_get()` so dot paths work.

```php
$response = $this->json(fn (): array => [
    'data' => ['user' => ['name' => 'Teguh']],
]);

$response['status'];
$response->assertEqual('data.user.name', 'Teguh');
$response->assertTrue('data.user.active', 'user must be active');
$response->assertNull('data.user.deleted_at');
$response->getData();               // the 'data' slice
$response->setResponseData([...]);  // replace the payload
```

| Method | Asserts |
| ------ | ------- |
| `assertEqual(string $dataKey, mixed $value)` | `assertEquals` on the dotted key |
| `assertTrue(string $dataKey, string $message = '')` | key value is `true` |
| `assertFalse(string $dataKey, string $message = '')` | key value is `false` |
| `assertNull(string $dataKey, string $message = '')` | key value is `null` |
| `assertNotNull(string $dataKey, string $message = '')` | key value is not `null` |
| `assertEmpty(string $dataKey)` | the whole `data` payload is empty |
| `assertNotEmpty(string $dataKey)` | the whole `data` payload is not empty |

Construction requires an array body, otherwise `Exception` (`Response body is not
Array.`). Unlike `TestResponse`, `offsetSet()`/`offsetUnset()` are allowed.

## `ResponseStatusTrait`

Status assertion shorthands used by `TestResponse`:

| Method | Code |
| ------ | ---- |
| `assertOk()` | 200 |
| `assertCreated()` | 201 |
| `assertNoContent()` | 204 |
| `assertBadRequest()` | 400 |
| `assertUnauthorized()` | 401 |
| `assertForbidden()` | 403 |
| `assertNotFound()` | 404 |
| `assertNotAllowed()` | 405 |

## Fake / mock helpers

The package ships no general-purpose fakes or database test utilities — HTTP
response testing is the scope. For in-memory fakes of collaborators reach for the
driver packages instead:

- sessions: `Omega\Session\Storage\ArrayStorage` (in-memory session driver);
- container: bind a `Closure` returning a fake through `$app->set(Name::class, fn () => $fake)`;
- facades: `AbstractFacade::flushInstance()` (done automatically in `tearDown()`)
  lets you swap and reset facade-backed services between tests.

## Exceptions

| Exception | When thrown |
| --------- | ----------- |
| `Exception` | `json()`/`TestJsonResponse` when the response body is not an array (`Response body is not Array.`) |
| `LogicException` | `TestResponse::offsetSet()`/`offsetUnset()` (`TestResponse is read-only.`) |

## Notes

- `TestCase::put()` sends its payload through request **attributes**, while
  `post()`/`delete()` use POST data.
- `call()` also runs `$kernel->terminate($request, $response)` after handling, so
  request-bound cleanup (e.g. session save) is exercised in feature tests.

## Reference

- `TestCase.php`, `TestResponse.php`, `TestJsonResponse.php`
- `Traits/ResponseStatusTrait.php`
- Tests: `tests/Unit/Testing/`
- Dependencies: `Omega\Application`, `Omega\Http`, `Omega\Container`,
  `Omega\Collection\data_get`, `Omega\Facade\AbstractFacade`, PHPUnit (via Pest)
- License: GPL-3.0+