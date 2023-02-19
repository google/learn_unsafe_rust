# Invalid values

> _“If you tell the truth, you don't have to remember anything.”__
>  — _Mark Twain_

Values of a particular type in Rust may never have an "invalid" bit pattern for that type. This is true even if that value is never read from afterwards.

A lot of basic types _don't_ have any rules about invalid values. All bit patterns of the integer types (and arrays of the integer types) are valid.

But most other types have some concept of validity.

## Types of invalid values

### Primitive types with invalid values

`bool`s that have bit patterns other than those for `true` and `false` are invalid. The same goes for `char`s representing byte patterns that are considered invalid in UTF-32.


`&T` and `&mut T` may not be null, nor may they be [unaligned] for values of type `T`. There are a lot of other reasons that a reference may not be valid, but these are the ones where the bit pattern is statically known to be invalid regardless of context.

### Enums with invalid values


Any bit pattern not covered by a variant of an enum is also invalid. For example, with the following enum:

```rust
enum Colors {
    Red = 1,
    Orange = 2,
    Yellow = 3,
    Green = 4,
    Blue = 5,
    Indigo = 6,
    Violet = 7,
}
```

a bit pattern of `8` or `0` (assuming that it gets represented as the explicit discriminant integers) is undefined behavior.

Or in this enum:

```rust
enum Stuff {
    Char(char),
    Number(u32),
}
```

setting the discriminant bit to something that is not the discriminant of `Char` or `Number` is invalid. Similarly, setting the discriminant bit to that for `Char` but having the value be invalid for a `char` is also invalid.

### Smart pointers and NonNull

Most smart pointer types like `Box<T>` and `Rc<T>` are invalid when null. Library types may achieve the same behavior using the [`NonNull<T>`] pointer type.

It's also currently invalid for `Vec<T>` to have a null pointer for its buffer! `Vec<T>` uses [`NonNull<T>`] internally, and empty vectors use a pointer value equal to the alignment of `T`.



### `#[repr(Rust)]` isn't stable!

Note that Rust's default representation for types is not stable! What might be a valid bit pattern one day may become invalid later, unless you're only relying on things that are known to be invariant.

### `str`

The string slice type `str` does not actually have any validity constraints: Despite being only for UTF-8 encoded strings, it is valid for `str`s to be in any bit pattern, provided you do not call any methods on the string that are not about directly accessing the memory behind it.

Basically, the UTF-8 validity of `str` is an implicit safety requirement for most of its methods, however it is fine to _hold on to_ an `&str` that points to random bytes.

This is something that can be relied on when doing things like manipulating or constructing `str`s byte-by-byte, where there may be intermediate invalid states.

Of course, reference types like `&str` must still satisfy all of the rules about reference validity (being non-null, etc).

### Invalid values for general library types

In general, types may have various invalid values based on their internal representation (which may not be stable!).

As a library user you may not assume anything about the representation of a library type unless it is explicitly documented as such, or if it has a public representation that is known to be stable (for example a public `#[repr(C)]` enum)

## When you might end up making an invalid value


Invalid values have a chance to crop up when you're reinterpreting a chunk of memory as a value of a different type. This can happen when calling [`mem::transmute()`], [`mem::transmute_copy()`], or [`mem::zeroed()`], or when casting a reference to a region of memory into one of a different type. The value need not be on the stack to be considered invalid: if you gin up an `&bool` that points to a bit pattern that is not a valid `bool`, that is instantly UB even if you don't read from the reference.

They can also happen when receiving values over FFI where either the signature of the function is incorrect (e.g. saying an FFI function accepts `bool` when the other side thinks it accepts a `u8`), or where there are differences in notions of validity across languages.

A subtle case of this comes up occasionally in FFI code due to differences in expectations between how enums are used in Rust and C.

In C, it is common to use enums to represent _bitmasks_, doing something like this:

```c
typedef enum {
    Active = 0x01;
    Visible = 0x02;
    Updating = 0x03;
    Focused = 0x04;
} NodeStatus;
```

where the value make take states like `Active | Focused | Visible`. These combined values, as well as the "no flags set" value `0` are invalid in Rust. If this type is represented as an enum in Rust ([even if it is `#[repr(C)]`][reprc-enum]!), it will be UB to accept values of this type over FFI from C. Generally in such cases it is recommended to use an integer type instead, and represent the mask values as constants.


## Things you might see if you used invalid data

The compiler is allowed to assume that values are never invalid; and it may use invalid states to signal other things, or pack types into smaller spaces.

For example, the type `Option<Box<T>>` will use the fact that the reference cannot be null to fit the entire type into the the same space `Box<T>` takes up, with the null pointer state representing `None`.

This can go even further with stuff like `Option<Option<Option<bool>>>` fitting into a single byte, up to and including the type with 254 `Option`s surrounding one `bool`. This general class of optimization is known as a "niche optimization", with bits representing invalid values being called "niches".

In such scenarios, invalid values may lead to values being interpreted as a different value, for example an `Option<NodeStatus>` using the enum from above would be interpreted as `None` if `NodeStatus` were represented as a Rust enum and an "empty status" value was received over C.

Furthermore, invalid values will break `match` statements, usually (but not necessarily) leading to an abort.

This is not an exhaustive list: ultimately, having an invalid value is UB and it remains illegal even if there are no optimizations that will break.



 [unaligned]: ../core_unsafety/dangling_and_unaligned_pointers.md
 [`mem::transmute()`]: https://doc.rust-lang.org/stable/std/mem/fn.transmute.html
 [`mem::transmute_copy()`]: https://doc.rust-lang.org/stable/std/mem/fn.transmute_copy.html
 [`mem::zeroed()`]: https://doc.rust-lang.org/stable/std/mem/fn.zeroed.html
 [`NonNull<T>`]: https://doc.rust-lang.org/stable/std/ptr/struct.NonNull.html
 [reprc-enum]: https://doc.rust-lang.org/reference/type-layout.html#reprc-field-less-enums