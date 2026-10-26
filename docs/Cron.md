# Omega MVC — Cron Package Manual

The `Omega\Cron` package provides a task scheduler for timed and recurring jobs.
A `Schedule` holds a pool of `ScheduleTime` tasks, each with a callback, timing
expression, retry policy, and optional logging. The `CronServiceProvider` wires
the schedule into the container, and the `Schedule` facade exposes it
statically. Console commands (`cron:run`, `cron:list`, `cron:work`) drive
execution from the CLI.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

## Schedule

The `Schedule` class manages a pool of `ScheduleTime` instances. Tasks are
registered with `call()` and executed in batch with `execute()`.

```php
use Omega\Cron\Schedule;

$schedule = new Schedule();

$schedule->call(function (array $params) {
    // task logic
    echo "Hello from cron!\n";
})->hourly()->eventName('greet');

$schedule->execute();   // runs all due tasks
```

### API

| Method | Description |
| ------ | ----------- |
| `__construct(?int $time = null, ?InterpolateInterface $logger = null)` | Optional base timestamp and logger. |
| `call(Closure $callBack, array $params = []): ScheduleTime` | Register a new task and return it for fluent configuration. |
| `execute(): void` | Run all tasks whose timing matches the current (or set) time. |
| `getPools(): ScheduleTime[]` | Return all registered tasks. |
| `add(Schedule $schedule): self` | Merge another schedule's tasks into this one. |
| `setTime(int $time): void` | Override the base timestamp (for persistent workers). |
| `setLogger(InterpolateInterface $logger): void` | Inject a logger for all tasks. |
| `flush(): void` | Remove all tasks from the pool. |

When `setTime()` is used, the timestamp is propagated to every `ScheduleTime`
instance during `execute()`, so a persistent worker can advance the clock each
iteration.

## ScheduleTime

Represents a single scheduled task with a callback, timing rules, retry policy,
skip condition, and optional logging. Created by `Schedule::call()`.

### Timing methods

| Method | Description |
| ------ | ----------- |
| `justInTime()` | Run exactly once at the current timestamp. |
| `everyTenMinute()` | Run every 10 minutes (0, 10, 20, …). |
| `everyThirtyMinutes()` | Run at :00 and :30. |
| `everyTwoHour()` | Run every 2 hours (0, 2, 4, …). |
| `everyTwelveHour()` | Run at midnight and noon. |
| `hourly()` | Run at the top of every hour. |
| `hourlyAt(int $hour24)` | Run once at a specific hour. |
| `daily()` | Run once at midnight. |
| `dailyAt(int $day)` | Run once on a specific day of the month at midnight. |
| `weekly()` | Run once on Sunday at midnight. |
| `monthly()` | Run once on the 1st of the month at midnight. |

All timing methods return `$this` for fluent chaining. The default (no timing
method called) uses the timestamp from construction — effectively `justInTime()`.

### Retry and skip

```php
$schedule->call($callback)
    ->retry(3)                // retry up to 3 times on failure
    ->retryIf($condition)     // retry only if condition is true
    ->skip(true);             // skip execution entirely
    ->skip(fn () => $isHoliday);  // skip based on runtime condition
```

| Method | Description |
| ------ | ----------- |
| `retry(int $attempt): self` | Set max retry attempts. |
| `retryIf(bool $condition): self` | Enable conditional retry. |
| `isRetry(): bool` | Whether conditional retry is active. |
| `retryAttempts(): int` | Remaining retry attempts. |
| `skip(bool\|Closure $skipWhen): self` | Conditionally skip execution. |

### Metadata

| Method | Description |
| ------ | ----------- |
| `eventName(string $val): self` | Set the event name (used in logging). |
| `anonymously(bool $runAsAnonymously = true): self` | Disable logging for this task. |
| `setTime(int $time): self` | Update the base timestamp. |
| `setLogger(InterpolateInterface $logger): void` | Inject a logger. |

Read-only properties (via property hooks):

| Property | Description |
| -------- | ----------- |
| `$eventName` | The event name (default `'anonymously'`). |
| `$timeName` | Name of the timing method used (e.g. `'hourly'`, `'daily'`). |
| `$anonymously` | Whether logging is disabled. |

### Execution flow

`expect()` checks `isDue()` against the current timestamp and the `$timeExpect`
array. If due and not skipped, the callback is invoked with `$params`. On
success the retry counter resets to 0; on failure it decrements. Execution time
is measured and logged via the `InterpolateInterface` (unless anonymous).

## InterpolateInterface

Contract for loggers that receive schedule execution data:

```php
interface InterpolateInterface
{
    public function interpolate(string $message, array $context = []): void;
}
```

The default `Log` implementation persists entries to the `cron` database table
using `Omega\Database\Facades\DB`:

| Column | Content |
| ------ | ------- |
| `message` | Event name string |
| `context` | JSON-encoded context array (execute_time, cron_time, event_name, attempts, error_message) |
| `date_create` | Current timestamp |

## CronServiceProvider

Registers two container bindings:

- `'cron.log'` — a `Log` instance.
- `'schedule'` — a `Schedule` instance with the current timestamp and the log
  logger.

```php
// Usage via container:
$schedule = app()->get('schedule');
$schedule->call($callback)->hourly();
$schedule->execute();
```

## Facade

```php
use Omega\Cron\Facade\Schedule;

Schedule::call(function () {
    // job logic
})->daily()->eventName('nightly-sync');

Schedule::execute();
Schedule::getPools();   // ScheduleTime[]
Schedule::flush();
```

The `Schedule` facade resolves the `'schedule'` container binding.

## Console commands

Three commands ship with the framework to drive cron execution from the CLI:

### `cron:run`

Executes all scheduled jobs once and exits:

```bash
php omega cron:run
```

Loads the schedule via `Schedule::add(new Schedule())` and calls `execute()`.
Displays execution time on completion.

### `cron:list`

Lists all registered scheduled jobs in a two-column format showing the timing
method, event name, and anonymous status:

```bash
php omega cron:list
```

### `cron:work`

Runs a persistent terminal worker that executes scheduled tasks every 60 seconds:

```bash
php omega cron:work
```

Handles `SIGINT` (CTRL+C) for graceful shutdown on non-Windows systems. Each
iteration updates the timestamp via `Schedule::setTime()` so recurring schedules
evaluate against the current time.

## Notes

- `ScheduleTime::isDue()` compares day-letter, day, hour, and minute. Timing
  methods pre-compute the expected time slots at registration, so only the
  current minute is matched.
- Tasks without an explicit timing method default to the construction timestamp
  — they run exactly once when `execute()` is called at that time.
- `Log` depends on `Omega\Database\Facades\DB` and the `cron` table existing
  in the database.
- There is no global `schedule()` helper.

## Reference

- `Schedule.php`, `ScheduleTime.php`, `InterpolateInterface.php`
- `Log.php`
- `CronServiceProvider.php`
- `Facade/Schedule.php` (accessor `'schedule'`)
- Console commands: `Commands/CronCommand.php`, `Commands/CronListCommand.php`,
  `Commands/CronWorkCommand.php`
- Tests: `tests/Unit/Cron/`
- Dependencies: `Omega\Database`, `Omega\Time`
- License: GPL-3.0+
