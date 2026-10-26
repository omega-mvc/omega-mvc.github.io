# Omega MVC — Macroable Package Manual

The `Omega\Macroable` package is a tiny trait that lets you add methods to a class
at runtime. Users call static `macro()` to register a callable under a name, and
subsequent calls — instance or static — are routed through `__call()` /
`__callStatic()` with the right `$this`/class binding. It powers the runtime
extension of `Omega\Text\Str` and `Omega\Http\Request`.

Only two files make up the package: `MacroableTrait` and the exception
`MacroNotFoundException`.

## The trait

```php
use Omega\Macroable\MacroableTrait;

final class Str
{
    use MacroableTrait;
    // ...
}
```

Macros are stored in the trait's `protected static array $macros`; because the
property is `static`, **each using class keeps its own copy** — registering on
`Str` does not affect `Request`. Registration is process-wide and shared by every
instance of the same class.

## Registering macros

```php
use Omega\Text\Str;

Str::macro('addPrefix', fn (string $text, string $prefix): string => $prefix . $text);

echo Str::addPrefix('laravel', 'i love ');      // 'i love laravel'
Str::hasMacro('addPrefix');                     // true
Str::resetMacro();                              // remove all macros
Str::hasMacro('addPrefix');                     // false
Str::addPrefix('a', 'b');                       // MacroNotFoundException
```

`macro(string $macroName, callable $callBack): void` returns void.

## Closure binding semantics

- **Instance call** (`$obj->whoAmI()`): the macro, if a `Closure`, is re-bound with
  `->bindTo($this, static::class)` — inside it, `$this` is the calling instance and
  `static::` resolves to the calling class. Real framework macros rely on this to
  access instance state:

```php
$request->macro('whoAmI', function () {
    return $this;
});
$request->whoAmI() === $request;   // true
```

- **Static call** (`Str::className()`): the `Closure` is bound with
  `->bindTo(null, static::class)` — no `$this`, but late static binding works:

```php
Str::macro('className', fn (): string => static::class);
Str::className();                  // Omega\Text\Str
```

- **Non-`Closure` callables** (function names, arrays, `strtoupper`, etc.) are
  stored and invoked as-is, without rebinding:

```php
Str::macro('upper', 'strtoupper');
Str::upper('ciao');                // 'CIAO'
```

Both `__call` and `__callStatic` throw `MacroNotFoundException` when `$method` is
not registered. The trait implements no other magic methods; `Request` defines its
own unrelated `__get()`.

## Consumers

Two framework classes use the trait:

- `Omega\Text\Str` (`final class Str`, `use MacroableTrait;` at line 73).
- `Omega\Http\Request` (`class Request implements ArrayAccess, IteratorAggregate`,
  `use MacroableTrait;` at line 81).

`Omega\Http\MacroServiceProvider` (provider #13 of 14 in
`Omega\Application\Application::$providers`) boots two `Request` macros:

```php
Request::macro(
    'validate',
    function (?Closure $rule = null, ?Closure $filter = null) {
        return Validator::make($this->all(), $rule, $filter);
    }
);

Request::macro('upload', function (string $fileName) {
    $files = $this->getFile();
    $file  = $files[$fileName] ?? null;

    if (!is_array($file)) {
        throw new InvalidArgumentException(
            sprintf('No uploaded file was found for the name [%s]', $fileName)
        );
    }

    return new UploadFile([
        'name'     => $file['name'],
        'type'     => $file['type'],
        'tmp_name' => $file['tmp_name'],
        'error'    => $file['error'],
        'size'     => $file['size'],
    ]);
});
```

So after the application boots you can write:

```php
$request->validate();                       // Omega\Validator\Validator on all() input
$request->validate($rule, $filter);         // with custom rules/filters
$request->upload('avatar');                 // Omega\Http\UploadFile
```

The `Str`/`Request` docblocks carry matching `@method` hints (`validate`,
`upload`; `addPrefix`, `hay`).

## Exceptions

| Exception | Base | When thrown |
| --------- | ---- | ----------- |
| `Exceptions\MacroNotFoundException` | `InvalidArgumentException` | `__call`/`__callStatic` with an unregistered macro name |

Message template (verbatim): ``Macro `%s` is not macro able.`` — the misspelled
English is in the source.

## Notes

- **Persistent workers**: macro state is static and survives across requests in a
  long-lived process. The framework never auto-clears it; only an explicit
  `resetMacro()` empties the registry. Register macros once at boot (e.g. in a
  service provider) and they persist — which is the intended model.
- Comparison with Laravel's `Macroable`: same `macro()`/`hasMacro()`/`__call`/
  `__callStatic`/`bindTo` mechanics, but Omega **always throws**
  `MacroNotFoundException` for missing macros (Laravel instead falls through to
  `BadMethodCallException`), the flush method is named `resetMacro()` (Laravel:
  `flushMacros()`), and the stored value is not wrapped — only genuine `Closure`s
  are rebound, so arbitrary callables work directly.
- There is **no facade** wrapping `Str`/`Request`, no `@mixin` support, and no
  per-request auto-reset of `$macros`.

## Reference

- `MacroableTrait.php`, `Exceptions/MacroNotFoundException.php`
- Consumers: `Omega\Text\Str`, `Omega\Http\Request`
- Registration: `Omega\Http\MacroServiceProvider`
- Tests: `tests/Unit/Macroable/MacroableTest.php`,
  `tests/Unit/Text/StrMacroTest.php`, `tests/Unit/Http/RequestTest.php`
- License: GPL-3.0+