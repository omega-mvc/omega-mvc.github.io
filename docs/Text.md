# Omega MVC — Text Package Manual

The `Omega\Text` package provides string utilities through a static class (`Str`), a
fluent value object (`Text`), a library of reusable regex constants (`Regex`), and
global helper functions. All string functions are multibyte-safe where it matters.

## Static string utilities — `Str`

```php
use Omega\Text\Str;

Str::of('hello');                          // -> Text fluent object
Str::concat(['i', 'love', 'omega']);       // "i love omega"
Str::concat(['a', 'b', 'c'], ' and ');     // "a and b and c"
Str::charAt('omega', 1);                   // "m"
Str::indexOf('omega', 'g');                // 3
Str::lastIndexOf('omega-mm', 'm');         // 7
Str::search('omega', 'm');                 // 1
Str::slice('omega', 0, 3);                 // "ome"
Str::after('https://x.dev/test', ':');     // "//x.dev/test"
Str::split('a,b,c', ',');                  // ["a","b","c"]
Str::split('abc');                         // ["a","b","c"]  (per character)
Str::match('abc-123', '/\d+/');            // ["123"]
Str::replace('aa', 'a', 'b');              // "bb"  (find/replace can be arrays)
Str::template('hi {name}', ['name' => 'Omega']);   // "hi Omega"
```

### Case conversion

```php
Str::toLowerCase('OMEGA');     // "omega"
Str::toUpperCase('omega');     // "OMEGA"
Str::firstUpper('omega');      // "Omega"    (ucfirst)
Str::firstUpperAll('omega mvc'); // "Omega Mvc"  (ucwords)
Str::toSnakeCase('Foo Bar');   // "Foo_Bar"
Str::toKebabCase('FooBar');    // "foo-bar"
Str::toPascalCase('foo bar');  // "FooBar"
Str::toCamelCase('Foo Bar');   // "fooBar"
Str::slug('I love Laravel');   // "i-love-laravel"   (throws on empty input)
```

### Length, padding, masking, truncation

```php
Str::length('omega');                      // 5 (bytes)
Str::fill('1234', '0', 6);                 // "001234"   (left-pad)
Str::fillEnd('1234', '0', 6);              // "123400"
Str::mask('laravel', '*', 1, 4);           // "l****el"
Str::limit('laravel best', 7);             // "laravel..."
Str::repeat('ab', 3);                      // "ababab"
```

### Checks

```php
Str::contains('omega', 'meg');             // true
Str::startsWith('omega', 'ome');           // true
Str::endsWith('omega', 'ga');              // true
Str::isEmpty('');                          // true
Str::isString('omega');                    // true
Str::isMatch('user@mail.com', Regex::EMAIL); // true
Str::is('user@mail.com', Regex::EMAIL);      // alias
Str::isMatch('2022-12-31', Regex::DATE_YYYYMMDD);
```

### Macros

`Str` uses the `MacroableTrait`, so you can extend it at runtime:

```php
Str::macro('addPrefix', fn ($text, $prefix) => $prefix . $text);
Str::addPrefix('omega', 'I love ');    // "I love omega"
Str::resetMacro();
```

Undefined method calls throw `Omega\Macroable\MacroNotFoundException`.

## Fluent value object — `Text`

`Text` wraps a string, lets you chain operations fluently, and keeps a log of the
modifications. It is `final` and **mutable** — each method mutates the internal
value in place and returns `$this` for chaining.

```php
use Omega\Text\Text;
use function Omega\Text\string;
use function Omega\Text\text;

$t = new Text('i love symfony');

$t->upper()->snake()->getText();      // "I_LOVE_SYMFONY"
$t->kebab();  $t->camel();  $t->pascal();
$t->lower();  $t->firstUpper();  $t->firstUpperAll();
$t->slug();                           // may throw NoReturnException on empty
$t->fill('0', 6);  $t->fillEnd('-', 8);
$t->mask('*', 2, 5);  $t->limit(10);
$t->after('love ');  $t->slice(0, 3);
$t->charAt(1);  $t->length();         // int
$t->indexOf('v'); $t->lastIndexOf('v');
$t->contains('sym'); $t->startsWith('i '); $t->endsWith('ny');
$t->isEmpty();  $t->is('/love/');

(string) $t;                 // current value
$t->getText();               // current value
$t->logs();                  // [{function, return, type}, ...]
$t->reset();                 // back to original string, clears log
$t->refresh('new text');     // set new original, then reset
$t->text('anything');        // set current string directly
$t->throwOnFailure(true);    // make slice() throw NoReturnException on failure
```

Helper functions:

```php
string('hello');     // new Text('hello')
text('hello');       // alias of string()
```

## Regex constants — `Regex`

A library of typed regex constants for `preg_match`/`Str::isMatch`:

| Constant | Matches |
| -------- | ------- |
| `Regex::EMAIL` | email addresses |
| `Regex::USER` | usernames (letter start, 4–16 alphanumeric) |
| `Regex::PLAIN_TEXT` | plain text with letters/digits/`_`/`-`/space |
| `Regex::SLUG` | `[a-z0-9]+(-[a-z0-9]+)*` |
| `Regex::HTML_TAG` | HTML tags |
| `Regex::JS_INLINE` | inline JS event handlers (`onclick`...) |
| `Regex::PASSWORD_COMPLEX` | ≥6 chars, digit + upper + lower + special |
| `Regex::PASSWORD_MODERATE` | ≥8 chars, digit + upper + lower |
| `Regex::DATE_YYYYMMDD` | `YYYY-MM-DD` |
| `Regex::DATE_DDMMYYYY` | `DD-MM-YYYY` (`-`, `.`, or `/`) |
| `Regex::DATE_DDMMMYYYY` | `DD-MMM-YYYY` (month names) |
| `Regex::IPV4`, `Regex::IPV6`, `Regex::IPV4_6` | IP addresses |
| `Regex::URL` | URLs with optional `http(s)://` |

```php
use Omega\Text\Regex;

if (preg_match(Regex::EMAIL, $input) === 1) { /* valid email */ }
if (Str::isMatch($input, Regex::PASSWORD_COMPLEX)) { /* strong */ }
```

## Exceptions

All implement `Omega\Text\Exceptions\TextExceptionInterface` (marker) and extend the
abstract `AbstractTextException` (`InvalidArgumentException`):

- `NoReturnException` — thrown by `Str::slug()` when the input produces no result,
  and by `Text::slice()` when `throwOnFailure(true)` is set. Message:
  `"The method %s called with %s did not return anything."`
- `PropertyNotExistException` — defined for property access failures.

## Reference

- `Str.php` (static utilities, macroable)
- `Text.php` (fluent object), `Regex.php` (constants)
- `helper.php` — `string()`, `text()`
- Exceptions: `Exceptions/`
- License: GPL-3.0+