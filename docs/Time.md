# Omega MVC — Time Package Manual

The `Omega\Time` package is a small, immutable wrapper around `DateTimeImmutable`
with fluent accessors, predicates for relative dates, and a set of RFC/ISO
formatting shortcuts. It has no external dependencies.

## Creating a date

```php
use Omega\Time\Now;
use function Omega\Time\now;

$now = new Now();                          // current date/time
$now = new Now('now', 'UTC');              // explicit timezone
$now = new Now('2023-03-01 15:30:45');     // any string PHP's date parser accepts
$now = new Now('+1 day');                  // relative dates
$now = new Now('tomorrow', 'Europe/Rome');

$now = now();                              // helper function (same as new Now())
```

The constructor accepts any value `DateTimeImmutable::__construct()` accepts
(`'now'`, ISO strings, `strtotime`-style expressions) plus an optional timezone.
Invalid input throws a `DateMalformedStringException`/`DateInvalidTimeZoneException`.

## Reading values

```php
$d = new Now('2026-03-02 15:30:45', 'UTC');

$d->getYear();        // 2026
$d->getMonth();       // 3
$d->getDay();         // 2
$d->getHour();        // 15
$d->getMinute();      // 30
$d->getSecond();      // 45
$d->getMonthName();   // "March"
$d->getDayName();     // "Monday"
$d->getShortDay();    // "Mon"
$d->getDayOfWeek();   // 1 (Mon) ... 7 (Sun)
$d->getTimeZone();    // "UTC"
$d->getTimestamp();   // unix timestamp
$d->getAge();         // whole years from this date until now
$d->format('Y-m-d');  // "2026-03-02"
(string) $d;          // "2026-03-02T15:30:45"
```

## Standard formats

Provided by the `DateTimeFormatTrait` and called on the instance:

```php
$d->formatATOM();              // 2026-03-02T15:30:45+00:00
$d->formatCOOKIE();
$d->formatRFC822();  $d->formatRFC850();  $d->formatRFC1036();
$d->formatRFC1123(); $d->formatRFC7231(); $d->formatRFC2822();
$d->formatRFC3339();           // standard (with milliseconds when true: formatRFC3339(true))
$d->formatRSS();
$d->formatW3C();
```

## Fluent immutable setters

Setters do not mutate the instance — each returns a **new** `Now`:

```php
$birthday = (new Now())
    ->setYear(1990)->setMonth(1)->setDay(1)
    ->setHour(9)->setMinute(30)->setSecond(0);

echo $birthday->getAge();   // whole years elapsed
```

## Predicates

Month checks `isJan()...isDec()`, weekday checks `isMonday()...isSunday()`, and
relative comparisons against the current instant:

```php
(new Now('tomorrow'))->isNextDay();     // true
(new Now('+1 hour'))->isNextHour();     // true
(new Now('yesterday'))->isLastDay();    // true
(new Now('next month'))->isNextMonth();
(new Now('last year'))->isLastYear();
// also: isNextYear, isNextMinute, isLastMonth, isLastHour, isLastMinute
```

## Notes

- The package provides **no** relative-time/diff-for-humans helpers and no Carbon
  compatibility layer. For human-readable elapsed time, implement it on top of
  `getTimestamp()`.

## Reference

- `Now.php` (immutable)
- `Traits/DateTimeFormatTrait.php`
- `helper.php` — `now()`
- License: GPL-3.0+