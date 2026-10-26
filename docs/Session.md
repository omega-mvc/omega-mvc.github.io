# Omega MVC — Session Package Manual

The `Omega\Session` package provides a high-level, JSON-encoded session API on top
of pluggable **storage drivers**. A `SessionManager` handles data management, flash
messages, namespaced bags, lifecycle and driver resolution; `StorageInterface`
drivers only persist raw strings. The package also ships a `Session` facade and
binds `StartSessionMiddleware` for per-request handling.

## The manager — `SessionManager`

`SessionManager` wraps a default `StorageInterface` driver. It encodes/decodes the
whole dataset (including the internal `_flash` slice) as JSON; drivers never see
the structure.

```php
use Omega\Session\SessionManager;
use Omega\Session\Storage\ArrayStorage;

$manager = new SessionManager('array', new ArrayStorage());
```

### Data access

```php
$manager->start();                    // load data + expire flash data
$manager->has('user_id');             // bool
$manager->get('user_id');             // mixed, null default
$manager->get('user_id', 0);
$manager->put('user_id', 42);
$manager->all();                      // array<string, mixed>
$manager->forget('user_id');
$manager->flush();                    // data, bags and flash cleared
```

Note the write method is `put()` (there is no `set()`/`remove()`); removal is
`forget()`.

### Session identifier

```php
$manager->getId();                    // ?string
$manager->setId('custom-session-id');
$manager->regenerate();               // new id, data kept
$manager->regenerate(destroy: true);  // destroy old data first
```

`regenerate()` returns `false` when the session has no id yet. `destroy()` wipes
both the stored data and the manager state (returns `false` when not started).

### Flash messages

```php
$manager->flash('status', 'Saved');   // available from the next request onwards
$manager->now('notice', 'Hi');        // available only for the current request
$manager->getFlash('status');         // read (same value as get())
$manager->hasFlash('status');
$manager->reflash();                  // keep current flash for one more request
$manager->clearFlash();               // drop all flash data
```

Flash bookkeeping (new/old key lists) is persisted inside the JSON payload as
`_flash` and restored on `start()`.

### Bags

```php
$bag = $manager->bag('cart');
$bag->put('total', 99);
$bag->get('total');
```

## The bag — `SessionBag`

`SessionBag` is a namespaced view over one slice of the session data. It holds a
reference to the manager's array, so mutations propagate immediately.

```php
$bag->getName();                 // 'cart'
$bag->has('total');              // bool
$bag->get('total', 0);           // mixed
$bag->put('total', 99);          // void, writes through
$bag->forget('total');
$bag->flush();                   // empties the bag slice
$bag->all();                     // array<string, mixed>
```

## The storage contract — `StorageInterface`

There is no `SessionInterface` in this package. The low-level persistence contract
is `StorageInterface`:

```php
interface StorageInterface
{
    public function read(string $id): string|false;
    public function write(string $id, string $data): bool;
    public function destroy(string $id): bool;
    public function gc(int $maxLifetime): int|false;
    public function createId(): string;
    public function close(): bool;
}
```

## Storage drivers

| Driver | Backend | Notes |
| ------ | ------- | ----- |
| `ArrayStorage` | in-memory array | for tests and ephemeral usage; `gc()` is a no-op |
| `NativeStorage` | PHP `$_SESSION` | shares the superglobal under one key; `createId()` uses `session_create_id()` |
| `CacheStorage` | any `CacheInterface` | keys prefixed (default `session_`), TTL `7200` s on write |
| `DatabaseStorage` | PDO table | delete+insert per write; expiry via `last_activity` |

```php
$array  = new ArrayStorage();
$native = new NativeStorage(['prefix' => 'omega', 'name' => 'omega']); // name → session_name()
$cache  = new CacheStorage($cacheAdapter, 'session_');
$db     = new DatabaseStorage($pdoConnection, 'sessions');
```

`DatabaseStorage` expects the `sessions` table. Create it with the SQL for the
engine you use:

### MariaDB / MySQL

```sql
CREATE TABLE sessions (
    id            VARCHAR(128) NOT NULL PRIMARY KEY,
    data          TEXT         NOT NULL,
    last_activity INT UNSIGNED NOT NULL
);
```

### SQLite3

```sql
CREATE TABLE sessions (
    id            VARCHAR(128) NOT NULL PRIMARY KEY,
    data          TEXT         NOT NULL,
    last_activity INTEGER NOT NULL
);
```

### PostgreSQL

```sql
CREATE TABLE sessions (
    id            VARCHAR(128) NOT NULL PRIMARY KEY,
    data          TEXT         NOT NULL,
    last_activity INTEGER NOT NULL
);
```

`read()` only returns rows whose `last_activity` is within the last 7200 seconds;
`gc($maxLifetime)` deletes rows older than it and returns `rowCount()`.

## Driver management

```php
$manager->setDriver('file', fn (): StorageInterface => new FileStorage(...));
$manager->getDriver();                          // default driver
```

Non-default drivers can be registered as `StorageInterface` instances or as
`Closure(): StorageInterface`, resolved lazily and cached on first use.

## Service provider — `SessionServiceProvider`

Reads the `session` configuration (`default`, `drivers`) and wires:

- `session.storage.<name>` — lazy binding per configured driver;
- `session` — the `SessionManager` (default driver is configured, others
  registered lazily);
- `StartSessionMiddleware::class` — middleware built on the `'session'` binding.

```php
// config/session.php (application side)
return [
    'default' => 'database',
    'drivers' => [
        'array'    => [],
        'native'   => ['prefix' => 'omega', 'name' => 'omega'],
        'cache'    => ['prefix' => 'session_'],
        'database' => ['table' => 'sessions'],
    ],
];
```

`createDriver()` supports `array`, `native`, `cache` and `database`; anything else
throws `UnknownDriverException`. Resolution of `'cache'` requires `app->get('cache')`
to be a `CacheInterface`; `'database'` requires the `DatabaseManager` to be a
`ConnectionInterface` — otherwise `UnknownDriverException` is thrown.

## The facade — `Session`

```php
use Omega\Session\Facade\Session;

Session::start();
Session::put('user_id', 42);
Session::get('user_id');
Session::flash('status', 'Saved');
Session::bag('cart')->put('total', 99);
Session::save();
```

`Session extends AbstractFacade` and resolves the `'session'` binding, forwarding
to the `SessionManager`. The `@method static` docblock also advertises `isValid()`
and `isInvalidate()`; these are **not** implemented on `SessionManager` today.

## `StartSessionMiddleware`

`Omega\Middleware\StartSessionMiddleware` wraps each request with the session
lifecycle:

```php
public function handle(Request $request, Closure $next): Response
{
    $this->session->start();
    $response = $next($request);
    $this->session->save();
    return $response;
}
```

## Exceptions

| Exception | Extends | When thrown |
| --------- | ------- | ----------- |
| `Exception\UnknownDriverException` | `RuntimeException` | `createDriver()` for an unknown driver type; `'cache'`/`'database'` resolving to a non-`CacheInterface`/`ConnectionInterface`; `StartSessionMiddleware` binding without a `SessionManager` |

## Notes

- Session data is JSON-encoded by the manager; `JSON_THROW_ON_ERROR` is used for
  both encode and decode, so corrupt payloads raise `JsonException`.
- Backwards compatibility with the `_flash` slice: unknown/non-string keys are
  dropped when loading, keeping the dataset strictly map-shaped.

## Reference

- `SessionManager.php`, `SessionBag.php`, `StorageInterface.php`
- `Storage/ArrayStorage.php`, `Storage/NativeStorage.php`, `Storage/CacheStorage.php`,
  `Storage/DatabaseStorage.php`
- `SessionServiceProvider.php`
- `Facade/Session.php`
- `Exceptions/UnknownDriverException.php`
- `Omega\Middleware\StartSessionMiddleware.php` (Middleware package)
- Tests: `tests/Unit/Session/`
- Dependencies: `Omega\Cache\CacheInterface`, `Omega\Database\ConnectionInterface`,
  `Omega\Container`
- License: GPL-3.0+