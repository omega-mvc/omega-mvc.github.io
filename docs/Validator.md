# Omega MVC — Validator Package Manual

The `Omega\Validator` package is a fluent validation and filtering library built on
top of **GUMP** (`wixel/gump`). The concrete `Validator` class manages input
fields, a `ValidPool` of validation rules and a `FilterPool` of filter rules.
Rules and filters are composed fluently as `Valid`/`Filter` objects, then compiled
to the GUMP rule strings. There is **no** `ValidatorInterface` and **no** validator
facade — the entry points are `Validator`, the `validate()` helper, and the
`vr()`/`fr()` rule builders.

## The validator — `Validator`

```php
use Omega\Validator\Validator;

$val = new Validator($_POST);
$val->name->required()->min_len(3);        // property-style rule
$val->field('email')->required()->valid_email();
$val('age')->required()->integer();        // invoke the validator
$val->field('password')->required()->equalsfield('password_confirmation');

if ($val->isValid()) {
    $clean = $val->filter_out(...);
}
```

`make()` is the static factory; closures receive the rule pools:

```php
$val = Validator::make($input, function (ValidPool $valid) {
    $valid('name')->required()->max_len(100);
    $valid('email')->required()->valid_email();
}, function (FilterPool $filter) {
    $filter('name')->trim()->upper_case();
});
```

### Public API

| Method | Description |
| ------ | ----------- |
| `field(string ...$field): Valid` | start building validation rules for a field |
| `filter(string ...$field): Filter` | start building filter rules for a field |
| `fields(iterable $fields): self` | set/replace the input array |
| `get_fields(): array` | input array |
| `isValid($rule_validation = null): bool` | run validation (optionally inline via closure) |
| `is_error($rule_validation = null): bool` | inverted `isValid()` |
| `getError(): array` | field → message map (runs validation once) |
| `errors(): Collection` | same as `getError()` as a `Collection` |
| `if_valid($condition): ValidationCondition` | run `$condition` when valid; chain `->else(fn ($errors) => ...)` on failure |
| `validOrException(?\Exception $exception = null): bool` | throw (or the given exception) when invalid |
| `validOrError(?\Exception $exception = null): bool\|array` | `true` or the error list |
| `filter_out($rule_filter = null): array` | apply filters and return cleaned input |
| `failedOrFilter(): array\|bool` | filtered array when valid, `true` when invalid |
| `validation($pools): self` | merge rules from a `ValidPool` closure |
| `filters($pools): self` | merge filters from a `FilterPool` closure |
| `messages($pools = null): MessagePool` | custom per-field/rule messages via closure |
| `setErrorMessages(array $messages): void` | custom messages as `field => message` map |
| `lang(string $lang): self` | GUMP validation message language |
| `submitted(): bool` | `true` when `REQUEST_METHOD === 'POST'` |
| `passed(): bool` | `isValid() && submitted()` |
| `fails(): bool` | inverted `passed()` |
| `only(array $fields): self` / `except(array $fields): self` | restrict which fields are validated/filtered |

Magic access is shorthand for common paths:

```php
$val->email->required();            // same as $val->field('email')
$val->errors;                       // Collection (same as ->errors())
$val->filters;                      // Collection of filtered output
$val->email = 'required|min_len,5'; // same as ->field('email')->raw(...)
```

## Validation rules — `Valid`

Build rules fluently; each method appends a GUMP rule. Parameters use `,` between
a rule and its params and `;` between array params; `not` inverts the next rule and
`if()`/`end_if()`/`where()` gate rules by a closure.

```php
$val->field('name')->required()->not->contains_list('a', 'b');
$val->field('status')->if(fn () => $editing)->required()->end_if();
$val->field('note')->where(fn () => $requiresNote)->min_len(2);
```

### Shipped validation rules

| Rule | Signature |
| ---- | --------- |
| `required` | `required()` |
| `contains` | `contains(string ...$values)` — shows possible values in the message |
| `contains_list` | `contains_list(string ...$values)` — hides the list |
| `doesnt_contain_list` | `doesnt_contain_list(string ...$values)` |
| `boolean` | `boolean(bool $strict = true)` — `yes/no`, `on/off`, `1/0`, `true/false`; strict mode allows only `true`/`false` |
| `valid_email` | `valid_email()` |
| `max_len` | `max_len(int $len)` |
| `min_len` | `min_len(int $len)` |
| `exact_len` | `exact_len(int $len)` |
| `between_len` | `between_len(int $min, int $max)` |
| `alpha` | `alpha()` |
| `alpha_numeric` | `alpha_numeric()` |
| `alpha_dash` | `alpha_dash()` |
| `alpha_numeric_dash` | `alpha_numeric_dash()` |
| `alpha_space` | `alpha_space()` |
| `alpha_numeric_space` | `alpha_numeric_space()` |
| `numeric` | `numeric()` |
| `integer` | `integer()` |
| `float` | `float()` |
| `valid_url` | `valid_url()` |
| `url_exists` | `url_exists()` |
| `valid_ip` | `valid_ip()` |
| `valid_ipv4` | `valid_ipv4()` |
| `valid_ipv6` | `valid_ipv6()` |
| `valid_cc` | `valid_cc()` — credit card |
| `valid_name` | `valid_name()` |
| `street_address` | `street_address()` |
| `iban` | `iban()` |
| `date` | `date(string $format)` — format like `d/m/Y` |
| `min_age` | `min_age(int $age)` — input `Y-m-d` |
| `max_numeric` | `max_numeric(int $num)` |
| `min_numeric` | `min_numeric(int $num)` |
| `starts` | `starts(string $startWith)` |
| `required_file` | `required_file()` |
| `extension` | `extension(string ...$extension)` |
| `equalsfield` | `equalsfield(string $fieldName)` — `equals_field()` is the v1 alias |
| `guidv4` | `guidv4()` |
| `phone_number` | `phone_number()` |
| `regex` | `regex(string $regex)` |
| `valid_json_string` | `valid_json_string()` |
| `valid_array_size_greater` | `valid_array_size_greater(int $size)` |
| `valid_array_size_lesser` | `valid_array_size_lesser(int $size)` |
| `valid_array_size_equal` | `valid_array_size_equal(int $size)` |
| `valid(callable, string $message)` | custom closure validator |
| `raw(string $rule)` | append a raw GUMP rule string |
| `not()` | invert the next rule |
| `if(callable)` / `end_if()` | apply the following rules only when the closure returns `true` |
| `where(callable)` | reset all built rules when the closure returns `false` |

## Filter rules — `Filter`

Filters sanitize input; they run through `filter_out()` / `failedOrFilter()`.

```php
$val->filter('email')->trim()->sanitize_email();
$val->filter('bio')->lower_case()->basic_tags();
$val->filter('title')->slug();
```

### Shipped filter rules

| Filter | Signature |
| ------ | --------- |
| `noise_words` | `noise_words()` |
| `rmpunctuation` | `rmpunctuation()` — strip punctuation |
| `urlencode` | `urlencode()` |
| `htmlencode` | `htmlencode()` |
| `sanitize_email` | `sanitize_email()` — strip illegal email chars |
| `sanitize_numbers` | `sanitize_numbers()` |
| `sanitize_floats` | `sanitize_floats()` |
| `sanitize_string` | `sanitize_string()` — strip script tags |
| `boolean` | `boolean()` — `['1','1',true,'on']` → `true`, else `false` |
| `basic_tags` | `basic_tags()` — keep a small safe HTML tag set |
| `whole_number` | `whole_number()` |
| `ms_word_characters` | `ms_word_characters()` — MS Word → web-safe chars |
| `lower_case` | `lower_case()` |
| `upper_case` | `upper_case()` |
| `slug` | `slug()` |
| `trim` | `trim()` |
| `filter(callable $value, $params)` | custom closure filter |
| `raw(string $rule)` | append a raw GUMP filter |
| `if(callable)` / `end_if()` / `where(callable)` | conditional application |

## Custom rules

Register custom validators and filters inline as closures. Every `valid()` call
registers a unique GUMP rule (random hex name) on `Rule::add_validator()` and
records an invert companion; the failure message supports `{field}` placeholders.

```php
$val = new Validator(['test' => 2]);

$val->field('test')->valid(
    fn ($field, $input, $param, $value) => $value % 2 === 1,
    '{field} must be an odd number',
);

$val->not->field('test')->valid(fn ($field, $input, $param, $value) => ...); // inverted

$val->filter('tag')->filter(fn ($value, $params) => strtoupper($value));

if ($val->isValid()) { /* ... */ }
```

Non-boolean conditions inside `if()`/`where()` throw `Exception`
(`Condition closure not return boolean`).

## Error messages and attributes

Errors are exposed as `field => message`. Default messages come from GUMP and are
switchable with `lang()`; custom messages can target a field, a rule, or both:

```php
$val->messages(function (MessagePool $messages) {
    $messages->email->validemail('Please provide a valid email.');
    $messages->set('name', (new Message())->add(['required' => 'Please set your name.']));
});

$val->setErrorMessages([
    'email' => ['validemail' => 'Bad email format.'],
]);

$val->errors;               // Collection<string, string>
$val->errors->all();        // ['email' => 'Bad email format.', ...]
```

`MessagePool` keys fields and returns `Message` objects; `Message` is
`ArrayAccess` over rule → message and implements `ValidationPropertyInterface`
(purely a doc-holder for the `@property` rule names).

## Inline validation and conditions

```php
$val->isValid(function (ValidPool $valid) {
    $valid('name')->required()->max_len(7);
    $valid('nest.number')->required();
    $valid('users.*.name')->required();      // wildcard path
});

$val->if_valid(function () use ($request) {
    $this->save($clean);
})->else(function (array $errors) {
    return $errors;
});
```

## Helper functions

```php
use function Omega\Validator\validate;
use function Omega\Validator\vr;
use function Omega\Validator\fr;

$val   = validate($_POST);                 // new Validator($input)
$valid = vr();                             // new Valid (fluent rule builder)
$filt  = fr();                             // new Filter (fluent filter builder)
```

## Exceptions

The package has no dedicated exception classes. Failures surface as PHP or GUMP
exceptions:

| Exception | When thrown |
| --------- | ----------- |
| `\Exception` | `validOrException()` with no/lacking validation — default `Exception("vaildate if fallen", 1)` or the supplied instance (source spelling) |
| `\Exception` | `Valid::if()`/`where()` or `Filter::if()`/`where()` closures not returning a boolean (`Condition closure not return boolean`) |
| `Random\RandomException` | `Valid::valid()` / `Filter::filter()` random rule-name generation fails |

## Notes

- Rules are lazily compiled to GUMP pipe strings: `required|min_len,5`,
  `contains,foo;bar`. `get_validation()`/`__toString()` on `Valid` exposes the
  compiled string.
- Validation is cached per validator via `has_run_validate`, and `getError()`
  runs the checks only once.
- `tests/Feature/Validator/` holds the non-mirrored integration suite (nested
  arrays, wildcards, invert and one-line validate+filter); unit suites live in
  `tests/Unit/Validator/`.

## Reference

- `Validator.php`, `Rule.php` (extends `\GUMP`), `ValidationCondition.php`
- `Rule/Valid.php`, `Rule/ValidPool.php`, `Rule/Filter.php`, `Rule/FilterPool.php`
- `Messages/Message.php`, `Messages/MessagePool.php`
- `Traits/InvertValidationTrait.php`, `Traits/CustomValidationTrait.php`,
  `Traits/CustomFilterTrait.php`
- `Contract/ValidationPropertyInterface.php`, `Contract/FilterPropertyInterface.php`
- `helper.php` (`validate()`, `vr()`, `fr()`)
- Tests: `tests/Unit/Validator/`, `tests/Feature/Validator/`
- Dependency: `wixel/gump` (^v2.3.1)
- License: GPL-3.0+