# Omega MVC — Queue Package Manual

The `Omega\Queue` package provides a job queue system with a driver-based
architecture. It supports pushing closures as jobs, delayed dispatch, and a
database-backed adapter. Jobs are serialized using `SerializableClosure` and
processed by a worker command.

## Configuration

Queue configuration lives under the `queue` key:

```php
// config/queue.php
return [
    'default' => 'database',
    'drivers' => [
        'database' => [
            'table' => 'jobs',
        ],
    ],
];
```

The `QueueServiceProvider` reads this configuration, creates adapter instances,
and registers the `QueueManager` in the container.

## QueueInterface contract

All adapters implement `Omega\Queue\QueueAdapterInterface`:

| Method | Description |
| ------ | ----------- |
| `push(Closure $job, array $data = [], string $queue = 'default', int $delay = 0): Job` | Push a new job onto the queue |
| `shift(): ?Job` | Pop the next available job (returns `null` when empty) |
| `size(string $queue = 'default'): int` | Number of pending jobs in the queue |
| `delete(Job $job): bool` | Remove a job from the queue |
| `release(Job $job, int $delay = 0): bool` | Release a job back into the queue with an optional delay |
| `failed(Job $job, Throwable $exception): void` | Mark a job as failed and remove it |

## QueueManager

The `QueueManager` wraps driver management and delegates operations to the
default or a named driver:

```php
use Omega\Queue\QueueManager;

$manager->push(fn () => doWork(), [], 'emails', delay: 30);
$manager->shift();
$manager->size('emails');
$manager->delete($job);
$manager->release($job, delay: 60);
$manager->failed($job, $exception);
```

Drivers can be registered as instances or lazy closures:

```php
$manager->setDriver('redis', fn () => new RedisQueueAdapter($redis));
$manager->getDriver('redis');       // resolves and caches the instance
$manager->getDriver();              // returns the default driver
$manager->getDriverNames();         // list<string> of registered driver names
$manager->getDefaultDriverName();   // string
```

## Job

Represents a single unit of work. Constructed by the adapter when a job is
pushed or shifted:

| Method | Description |
| ------ | ----------- |
| `getId(): int` | Database row ID |
| `getQueue(): string` | Queue name |
| `getPayload(): string` | Serialized payload |
| `getAttempts(): int` | Number of processing attempts |
| `getReservedAt(): ?string` | Timestamp when the job was reserved |
| `getAvailableAt(): ?string` | Timestamp when the job becomes available |
| `getCreatedAt(): string` | Creation timestamp |
| `getRawBody(): mixed` | Unserializes and returns the payload (typically a closure) |
| `isDeleted(): bool` | Whether the job has been marked as deleted |
| `isReleased(): bool` | Whether the job has been marked as released |
| `markDeleted(): void` | Mark the job as deleted (internal) |
| `markReleased(): void` | Mark the job as released (internal) |

## DatabaseQueueAdapter

The only built-in adapter. Stores jobs in a relational database table with
columns: `id`, `queue`, `payload`, `attempts`, `reserved_at`, `available_at`,
`created_at`.

```php
use Omega\Queue\Adapter\DatabaseQueueAdapter;

$adapter = new DatabaseQueueAdapter($connection, 'jobs');
$job     = $adapter->push(fn () => sendEmail($user), [], 'emails', delay: 30);
```

- `push()` wraps the closure in an `UnsignedSerializableClosure` before
  serializing.
- `shift()` selects the next unreserved, available job and marks it as reserved.
- `release()` clears `reserved_at`, increments `attempts`, and sets a new
  `available_at`.
- `delete()` and `failed()` remove the row from the table.

### Serializable closure support

Closures pushed to the queue are wrapped in
`Omega\SerializableClosure\UnsignedSerializableClosure` before serialization.
When the worker deserializes the payload with `getRawBody()`, the original
closure is restored and can be invoked directly.

## Queue facade

```php
use Omega\Queue\Facade\Queue;

Queue::push(fn () => doWork(), [], 'default', 0);
Queue::shift();
Queue::size();
Queue::delete($job);
Queue::release($job, 60);
Queue::failed($job, $exception);
```

The facade resolves the `queue` binding (a `QueueManager` instance) from the
container.

## QueueWorkCommand

A console command that processes jobs continuously:

```bash
php console queue:work
```

The worker loops until interrupted (`SIGINT`). On each iteration it shifts a
job, deserializes the payload, invokes it, and deletes the job on success. On
failure, the job is marked as failed and the error is logged. The command
sleeps 1 second between iterations when the queue is empty.

## Service provider

`QueueServiceProvider` boots the queue system:

1. Reads `config.queue.default` and `config.queue.drivers`.
2. Creates a `QueueAdapterInterface` instance for each driver.
3. Registers a `QueueManager` under the `queue` container key with all drivers
   attached (lazy closures for non-default drivers).

## Exceptions

| Exception | Namespace | Thrown when |
| --------- | --------- | ----------- |
| `QueueException` | `Omega\Queue\Exception` | Generic queue failure (extends `RuntimeException`) |
| `UnknownDriverException` | `Omega\Queue\Exception` | `QueueManager::getDriver()` with an unregistered driver name |

## Notes

- The `QueueServiceProvider` currently only supports the `database` driver.
  Custom drivers can be added via `QueueManager::setDriver()`.
- Failed jobs are deleted from the database table; there is no failed-job
  archive by default.
- The worker requires `pcntl` extension support for graceful `SIGINT` handling.
- The queue table must be created in your database before use.

## Reference

- `QueueAdapterInterface.php`, `QueueManager.php`, `Job.php`
- `Adapter/DatabaseQueueAdapter.php`
- `Facade/Queue.php`
- `QueueServiceProvider.php`
- `Exception/QueueException.php`, `Exception/UnknownDriverException.php`
- Related: `Omega\Console\Commands\QueueWorkCommand`, `Omega\SerializableClosure\UnsignedSerializableClosure`
- Tests: `tests/Unit/Queue/`
- License: GPL-3.0+
