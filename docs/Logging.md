# Omega MVC — Logging Package Manual

The `Omega\Logging` package is a PSR-3 logger built around a `LoggingManager`
(multiple named **drivers**, one default), a file/stream driver (`Stream`), a
service provider, and the `Logger` facade. It depends on `Omega\Time\Now` for
timestamps and on `Omega\Container` for wiring.

## The manager — `LoggingManager`

`LoggingManager implements Psr\Log\LoggerInterface`. You create it with the name
of the default driver and the default driver instance, then register additional
named drivers.

```php
use Omega\Logging\LoggingManager;
use Omega\Logging\Stream;
use Psr\Log\LogLevel;

$stream = new Stream(
    logDirectory: '/var/www/app/storage/logs',
    logLevelThreshold: LogLevel::WARNING,
    options: ['prefix' => 'app_', 'dateFormat' => 'Y-m-d H:i:s'],
);

$manager = new LoggingManager('stream', $stream);
$manager->setDriver('sql', fn (): LoggerInterface => new MyDbLogger(...));

$manager->getDriver();            // default driver (the stream)
$manager->getDriver('sql');       // resolves the lazy closure and caches it
$manager->setDefaultDriver(...);  // chainable
```

Unknown driver names throw `UnknownDriverException`. Drivers can be registered as
ready `LoggerInterface` instances or as `Closure(): LoggerInterface` (resolved
lazily on first use, cached afterward).

### PSR-3 levels

All standard levels are delegated to the default driver:

```php
$manager->emergency($message, $context);
$manager->alert($message, $context);
$manager->critical($message, $context);
$manager->error($message, $context);
$manager->warning($message, $context);
$manager->notice($message, $context);
$manager->info($message, $context);
$manager->debug($message, $context);
$manager->log($level, $message, $context);
```

Any other method name is forwarded to the default driver via `__call`:

```php
$manager->write('raw line');      // => default driver's write()
```

## The `Stream` driver

`Stream extends Psr\Log\AbstractLogger` and writes to a file or a PHP stream
(`php://stdout`, `php://stderr`).

```php
use Omega\Logging\Stream;
use Psr\Log\LogLevel;

$logger = new Stream('/var/www/app/storage/logs');            // dir + log_YYYY-MM-DD.txt
$logger = new Stream('/var/www/app/storage/logs/app.log');    // explicit file path
$logger = new Stream('php://stderr', LogLevel::EMERGENCY);    // stdout/stderr
```

The first argument is either a **directory** (a dated filename like
`log_2026-09-01.txt` is generated inside it) or an **explicit file path ending in
`.log`/`.txt`** (written directly). Logging to `php://stdout`/`php://stderr` is
supported and bypasses file handling.

### Options

| Option | Default | Meaning |
| ------ | ------- | ------- |
| `extension` | `'txt'` | Extension for auto-generated filenames |
| `dateFormat` | `'Y-m-d G:i:s.u'` | Timestamp format in log lines |
| `filename` | `false` | Fixed filename; `.log`/`.txt` used as-is, else `name.extension` |
| `flushFrequency` | `false` | Flush the buffer every N written lines |
| `prefix` | `'log_'` | Prefix for auto-generated filenames |
| `logFormat` | `false` | Custom template (see below) |
| `appendContext` | `true` | Append a var-exported context block to each line |

### Level threshold

Messages below the threshold are dropped by `log()`:

```php
$logger = new Stream($dir, LogLevel::WARNING);
$logger->error('boom');      // written
$logger->info('noise');      // ignored (INFO=6 > threshold WARNING=4)
```

Levels map to priorities: `EMERGENCY=0 … DEBUG=7`. An unknown level string throws
`LogArgumentException`; a non-string level throws `LogArgumentException` too.

### Default line format

```
[2026-09-01 10:15:30.123456] [error] boom
    foo: 'bar'
```

With `options['logFormat'] = "{date} [{level}] {message}"` the placeholders
`{date}`, `{level}`, `{level-padding}`, `{priority}`, `{message}`, `{context}`
are filled in. A message given as a `Stringable` object is stringified first.

### Public API

```php
$logger->getLogFilePath();          // current file path string
$logger->getLastLogLine();          // last line written
$logger->setFileHandle('a');        // (re)open the file
$logger->setLogToStdOut('php://stdout');
$logger->setLogFilePath('/path');   // recompute log path
$logger->setDateFormat('Y-m-d');    // change timestamp format
$logger->setLogLevelThreshold('error');
$logger->write('raw text');         // write unformatted; flush on flushFrequency
$logger->log($level, $message, $context);
```

Construction and writing throw `RuntimeException` for: target or parent path
being an existing file, failed directory creation, unwritable/undetectable file,
path being a directory, `fopen` failure, or `fwrite` failure. The file handle is
closed in `__destruct`.

## Service provider — `LoggingServiceProvider`

Reads the `logging` configuration and wires the container:

- every non-`default` key becomes a `logging.<name>` lazy binding;
- `'logging'` resolves to a `LoggingManager` whose default is `logging.default`.

```php
// config/logging.php (application side)
return [
    'default' => 'stream',
    'stream'  => [
        'type'    => 'stream',
        'path'    => '/path/to/logs',
        'minimum' => 'warning',
        'options' => ['prefix' => 'app_'],
    ],
];
```

`createDriver()` currently supports only `type: 'stream'`; any other type throws
`LogArgumentException` with `Unsupported logger type [%s].` The `stream` driver
uses `path`, `minimum` (defaults to `LogLevel::DEBUG`), and `options`
(defaults to `[]`).

## The facade — `Logger`

```php
use Omega\Logging\Facade\Logger;

Logger::info('Order placed', ['id' => 42]);
Logger::getDriver();
Logger::setDriver('sql', $dbLogger);
Logger::getLogFilePath();
```

`Logger extends Omega\Facade\AbstractFacade` and resolves the `'logging'` binding,
so it forwards to the `LoggingManager`. The `@method static` docblock lists the
full forwarded API (`setDriver`, `setDefaultDriver`, `getDriver`, all PSR-3
methods, and the `Stream` helpers `write`, `setFileHandle`, `setLogToStdOut`,
`setLogFilePath`, `setDateFormat`, `setLogLevelThreshold`, `getLogFilePath`,
`getLastLogLine`).

## Exceptions

| Exception | Base | When thrown |
| --------- | ---- | ----------- |
| `Exception\LogArgumentException` | `InvalidArgumentException` | Unknown/non-string log level; unsupported driver type |
| `Exception\UnknownDriverException` | `Exception` | `getDriver()` for an unregistered driver |

## Notes

- The package implements **PSR-3** (`Psr\Log`): `LoggerInterface`,
  `AbstractLogger`, `LogLevel`.
- There is **no** global `log()` helper (the `log()` you find in the codebase
  belongs to `ExceptionHandler`/`HandleExceptions`, not this package).

## Reference

- `LoggingManager.php`, `Stream.php`, `LoggingServiceProvider.php`
- `Facade/Logger.php`
- `Exception/LogArgumentException.php`, `Exception/UnknownDriverException.php`
- Tests: `tests/Unit/Logging/`
- Dependencies: `Omega\Time\Now`, `Omega\Application` helpers (`slash`), PSR-3
- License: GPL-3.0+