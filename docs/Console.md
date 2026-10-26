# Omega MVC — Console Package Manual

The `Omega\Console` package provides the CLI entry point for Omega applications.
It bridges the Omega container with Symfony Console, offering attribute-based
command declaration, lazy container resolution, a branded ASCII header, and a
custom `Style` helper. Commands are discovered from framework and application
directories, cached to a `commands.php` file, and resolved through the container
on demand.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

Symfony Console components are required (`symfony/console`).

## ConsoleApplication

`ConsoleApplication` is the top-level entry point. Call `handle()` with raw CLI
arguments or a pre-built `InputInterface`:

```php
use Omega\Application\ApplicationInterface;
use Omega\Console\ConsoleApplication;

$app->bootstrapWith([
    ConfigBootstrapper::class,
    FacadeBootstrapper::class,
    RegisterProviders::class,
    BootProviders::class,
]);

$console = new ConsoleApplication($app);
$exitCode = $console->handle();           // uses ArgvInput + ConsoleOutput
$exitCode = $console->handle($argv);     // explicit input array
```

### Lifecycle

1. `bootstrap()` runs configured bootstrappers (config, facades, providers).
2. `configureCommandLoader()` scans `src/Omega/Console/Commands/` and
   `path.command` (the application command directory) for `*Command.php` classes
   carrying the `#[AsCommand]` attribute. Results are cached to
   `<app-cache-path>/commands.php` when available.
3. A `CommandLoader` is assigned to the Symfony Console `Application` for lazy
   resolution.
4. The `ConsoleBranding` (extended Symfony Application) renders the ASCII logo
   and runtime info (environment, debug, PHP version, memory, command cache
   status) before delegating to Symfony's run loop.

Silent commands (`list`, `help`, `completion`, `--version`, `--quiet`) skip the
header rendering.

## The AsCommand attribute

Commands declare metadata via `#[AsCommand]` instead of overriding `configure()`:

```php
use Omega\Console\AbstractCommand;
use Omega\Console\Attribute\AsCommand;

#[AsCommand(
    name: 'app:clean',
    description: 'Clean stale cache entries',
    aliases: ['clean', 'app:flush'],
    hidden: false,
    arguments: [
        'age' => [Argument::REQUIRED, 'Max age in hours', 24],
    ],
    options: [
        'dry-run' => ['--dry-run', ValueOption::NONE, 'Preview without executing'],
    ],
)]
final class CleanCommand extends AbstractCommand
{
    public function __invoke(): int
    {
        $age = $this->getArgument('age');
        $dryRun = $this->getOption('dry-run');
        // ...
        return self::SUCCESS;
    }
}
```

### AsCommand properties

| Property | Type | Description |
| -------- | ---- | ----------- |
| `name` | `string` | Command name (e.g. `'app:clean'`). |
| `description` | `?string` | Short description shown in command list. |
| `aliases` | `array<int, string>` | Alternative invocation names. |
| `hidden` | `bool` | Hide from the command list. |
| `arguments` | `array<string, array>` | `[mode, description, default?]` per argument. |
| `options` | `array<string, array>` | `[shortcut, mode, description, default?, suggestedValues?]` per option. |

Argument/option modes use Symfony constants (`Argument::REQUIRED`,
`Argument::OPTIONAL`, `ValueOption::NONE`, `ValueOption::REQUIRED`, etc.).

## AbstractCommand

Base class for all Omega commands. Extends Symfony's `Command` and implements
the single-method `__invoke()` pattern:

```php
use Omega\Console\AbstractCommand;
use Omega\Console\Attribute\AsCommand;

#[AsCommand(name: 'hello', description: 'Say hello')]
final class HelloCommand extends AbstractCommand
{
    public function __invoke(): int
    {
        $name = $this->getArgument('name') ?? 'World';
        $this->io->info("Hello, {$name}!");
        return self::SUCCESS;
    }
}
```

### Properties and methods

| Member | Description |
| ------ | ----------- |
| `$input` | Current `InputInterface` instance. |
| `$output` | Current `OutputInterface` instance. |
| `$io` | `Style` instance (styled console output). |
| `$terminal` | Symfony `Terminal` instance. |
| `$app` | The Omega `ApplicationInterface`, set by the `CommandLoader`. |
| `getArgument(string $key): mixed` | Read a command argument. |
| `getOption(string $key): mixed` | Read a command option. |
| `call(string $commandName, array $parameters = []): int` | Invoke another command programmatically. |
| `__invoke()` | Abstract; implement command logic here. |

### The `call()` method

Runs another registered command internally, forwarding the current output:

```php
$this->call('cache:clear');
$this->call('migrate:fresh', ['--force' => true]);
```

Errors are caught and displayed via `$this->io->error()`; returns `self::FAILURE`
on failure.

## Style

`Omega\Console\Style` extends Symfony's `SymfonyStyle` with Omega-specific
formatting:

- Automatic two-space indentation on all output lines.
- Labelled message blocks: `success()`, `error()`, `warning()`, `comment()`,
  `note()`, `info()`, `title()`, `section()`, `text()`.
- `ask()` and `confirm()` with cyan `?` prefix.
- `progressBar(int $max, string $message)` — custom-styled progress bar with
  green bar characters and grey empty fill.

Spacing is managed via `ensureTopSpacing()` to avoid duplicate blank lines between
output blocks.

## ConsoleBranding

Extends Symfony's `Application` to render the Omega ASCII logo and a runtime
info bar (environment, debug status, PHP version, memory usage, command cache
status) before non-silent commands. The logo and info are skipped for `list`,
`help`, `completion`, and `--version`/`--quiet` flags.

## CommandLoader

Implements Symfony's `CommandLoaderInterface`. Commands are resolved lazily
through the Omega container:

```php
$loader = new CommandLoader($app, [
    'cache:clear'  => CacheClearCommand::class,
    'route:list'   => RouteListCommand::class,
]);
$command = $loader->get('cache:clear');  // container-resolved
```

The `$app` property is injected into `AbstractCommand` instances on resolution.

## Attributes

### `AsCommand`

Declares command metadata (see above). Processed via reflection at discovery
and configuration time.

### `Make`

Metadata attribute for "make" style commands that generate files from templates:

| Property | Description |
| -------- | ----------- |
| `template` | Path to the stub/template file. |
| `path` | Container binding or key for the base save path. |
| `pattern` | Placeholder in the template to replace. |
| `suffix` | Suffix appended to the generated file name. |
| `target` | Logical target path for display/resolution. |
| `info` | Success message. |
| `warning` | Message when file already exists. |
| `vars` | Additional template variables `[placeholder => transformation]`. |

## Traits

### InteractsWithConsoleOutputTrait

Provides width-aware helpers for aligned console output:

| Method | Description |
| ------ | ----------- |
| `getTerminalWidth(): int` | Cached terminal width in columns. |
| `getVisibleWidth(string): int` | Visible width of an ANSI-decorated string. |
| `getVisibleMaxWidth(array): int` | Maximum visible width from an array of strings. |
| `writeRight(string, int $margin)` | Right-align a message against the terminal edge. |
| `componentsTwoColumns(string $left, string $right)` | Dotted-fill two-column layout. |

### InteractWithFilesystemTrait

Recursively finds files using `fnmatch()` glob patterns:

```php
$files = $this->findFiles('/path', '*.php', ['Test*.php']);
```

Hidden files and symlinks are skipped. Results are sorted by path.

## Shipped commands

The framework ships with commands under `Omega\Console\Commands\`:

| Command | Description |
| ------- | ----------- |
| `cache:clear` | Clear the cache |
| `command:map` | List all registered commands |
| `command:clear` | Clear the command cache |
| `config:cache` | Cache the configuration |
| `config:clear` | Clear the configuration cache |
| `cron:run` | Run all scheduled cron jobs |
| `cron:list` | List all scheduled cron jobs |
| `cron:work` | Simulate the cron scheduler in the terminal |
| `database:create` | Create the database |
| `database:show` | Show database tables |
| `database:wipe` | Drop all tables |
| `maintenance:down` | Put application in maintenance mode |
| `maintenance:up` | Bring application out of maintenance mode |
| `make:command` | Create a new console command |
| `make:controller` | Create a new controller |
| `make:exception` | Create a new exception class |
| `make:middleware` | Create a new middleware class |
| `make:migration` | Create a new database migration |
| `make:model` | Create a new model class |
| `make:provider` | Create a new service provider |
| `make:seed` | Create a new database seeder |
| `make:view` | Create a new view template |
| `migrate:fresh` | Drop all tables and re-run migrations |
| `migrate:init` | Initialize the migration system |
| `migrate:refresh` | Reset and re-run migrations |
| `migrate:reset` | Rollback all migrations |
| `migrate:rollback` | Rollback the last migration |
| `migrate:run` | Run pending migrations |
| `migrate:status` | Show migration status |
| `package:discover` | Rebuild the cached package manifest |
| `route:cache` | Cache the routes |
| `route:clear` | Clear the route cache |
| `route:list` | List all registered routes |
| `seed` | Run database seeders |
| `serve` | Start the development server |
| `vendor:publish` | Publish vendor assets |
| `view:cache` | Compile all view templates |
| `view:clear` | Clear compiled view templates |
| `view:watch` | Watch view templates for changes |
| `queue:work` | Process queued jobs |

Application commands placed in `path.command` (typically `app/Console/Commands/`)
are discovered and merged with framework commands.

## Exceptions

| Exception | When thrown |
| --------- | ----------- |
| `InvalidArgumentException` | Invalid argument/option configuration in `#[AsCommand]` |

The exception extends `LogicException`.

## Reference

- `ConsoleApplication.php`, `AbstractCommand.php`, `CommandLoader.php`
- `Style.php`, `ConsoleBranding.php`
- `Attribute/AsCommand.php`, `Attribute/Make.php`
- `Traits/InteractsWithConsoleOutputTrait.php`, `Traits/InteractWithFilesystemTrait.php`
- `Commands/` — all shipped commands
- `Exceptions/InvalidArgumentException.php`
- Tests: `tests/Unit/Console/`
- Dependencies: Symfony Console, Omega Container
- License: GPL-3.0+
