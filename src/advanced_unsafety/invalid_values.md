# Invalid values

> _“If you tell the truth, you don't have to remember anything.”__
>  — _Mark Twain_

Values of a particular type in Rust may never have an "invalid" bit pattern for that type. This is true even if that value is never read from afterwards, or if that value simply exists behind an unread reference. From [the reference]:

> "Producing" a value happens any time a value is assigned to or read from a place, passed to a function/primitive operation or returned from a function/primitive operation.



A lot of basic types _don't_ have any rules about invalid values. For example, all bit patterns of the integer types (and arrays of the integer types) are valid. But most other types have some concept of validity.

## Types of invalid values

### Uninitialized memory

Values of _any_ type can be "uninitialized", which is considered instantly UB even for types like integers. We discuss this further in [the chapter on uninitialized memory][uninit-chapter]. For now this chapter will largely cover cases where a type may have an invalid _bit pattern_, rather than other cases where it may be invalid due to e.g. not having an initialized bit representation at all.

### Primitive types with invalid values

`bool`s that have bit patterns other than those for `true` and `false` are invalid. The same goes for `char`s representing byte patterns that are considered invalid in UTF-32 (anything that is either a surrogate character, or greater than `char::MAX`).


### Pointers with invalid values

`&T` and `&mut T` may not be null, nor may they be [unaligned] for values of type `T`.

`fn` pointers and the metadata part of `dyn Trait` may not be null either.

Most smart pointer types like `Box<T>` and `Rc<T>` are invalid when null. Library types may achieve the same behavior using the [`NonNull<T>`] pointer type.

It's also currently invalid for `Vec<T>` to have a null pointer for its buffer! `Vec<T>` uses [`NonNull<T>`] internally, and empty vectors use a pointer value equal to the alignment of `T`.

There are a lot of other reasons that a pointer type may not be valid, but these are the ones where the bit pattern is statically known to be invalid regardless of context. We'll be covering these in more depth in other chapters (@@note: where?), but, for example, all of these pointers must not only be non-null, they must also point to an actual valid instance of that type at all times (except `Vec<T>`, which is allowed to refer to invalid-but-aligned-and-non-null memory when it is empty)

#### "shallow" vs "deep" validity


An open question in Rust's model is whether references and reference-like types have "shallow" validity (roughly, the rules above), or "deep" validity (where a reference is valid only when the pointed-to data is valid, and that applies transitively). This issue is tracked upstream as [UGC #77](https://github.com/rust-lang/unsafe-code-guidelines/issues/77). The current discussion seems to skew towards shallow validity as opposed to deep validity, but this code change.

For the purposes of _writing_ unsafe code, it is convenient to imagine the boundary as being such that `&`/`&mut` references should never point to invalid memory. However, when auditing existing unsafe code it may be okay to allow scenarios that assume only shallow validity is required, depending on your risk appetite.

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

### `str`

The string slice type `str` does not actually have any validity constraints: Despite being only for UTF-8 encoded strings, it is valid for `str`s to be in any bit pattern, provided you do not call any methods on the string that are not about directly accessing the memory behind it.

Basically, the UTF-8 validity of `str` is an implicit safety requirement for most of its methods, however it is fine to _hold on to_ an `&str` that points to random bytes. This is a difference between things being "insta-UB" and "UB on use": invalid value UB is typically "insta UB" (it's UB even if you don't _do_ anything with the invalid value), but here you're allowed to do this as long as you don't use the data in certain ways.

This is something that can be relied on when doing things like manipulating or constructing `str`s byte-by-byte, where there may be intermediate invalid states.

Of course, reference types like `&str` must still satisfy all of the rules about reference validity (being non-null, etc).

### Invalid values for general library types

In general, types may have various invalid values based on their internal representation (which may not be stable!). 
In addition to [`NonNull<T>`], the Rust standard library provides [`NonZeroUsize`] and a bunch of other similar `NonZero` integer types that work as its integer counterparts, and libraries may use these internally.


Note that Rust's default representation for types is not stable! What might be a valid bit pattern one day may become invalid later, unless you're only relying on things that are known to be invariant. Converting a type to its bits, sending it over the network, and converting it back is extremely fragile, and will break if the two sides are on different platforms or even Rust versions.

As a library user you may not assume anything about the representation of a library type unless it is explicitly documented as such, or if it has a public representation that is known to be stable (for example a public `#[repr(C)]` enum)



## When you might end up making an invalid value


Invalid values have a chance to crop up when you're reinterpreting a chunk of memory as a value of a different type. This can happen when calling [`mem::transmute()`], [`mem::transmute_copy()`], or [`mem::zeroed()`], when casting a reference to a region of memory into one of a different type, or when accessing the wrong variant of a `union`. The value need not be on the stack to be considered invalid: if you gin up an `&bool` that points to a bit pattern that is not a valid `bool`, that can instantly be UB (in a "deep validity" world) even if you don't read from the reference.

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


## Signs an invalid value was involved

The compiler is allowed to assume that values are never invalid; and it may use invalid states to signal other things, or pack types into smaller spaces.

For example, the type `Option<Box<T>>` will use the fact that the reference cannot be null to fit the entire type into the the same space `Box<T>` takes up, with the null pointer state representing `None`.

This can go even further with stuff like `Option<Option<Option<bool>>>` fitting into a single byte, up to and including the type with 254 `Option`s surrounding one `bool`. This general class of optimization is known as a "niche optimization", with bits representing invalid values being called "niches".

In such scenarios, invalid values may lead to values being interpreted as a different value, for example an `Option<NodeStatus>` using the enum from above would be interpreted as `None` if `NodeStatus` were represented as a Rust enum and an "empty status" value was received over C.

Furthermore, invalid values will break `match` statements, usually (but not necessarily) leading to an abort.

Debuggers also tend to behave strangely with invalid values, displaying incorrect values, or even having the value change from read to read.

This is not an exhaustive list: ultimately, having an invalid value is UB and it remains illegal even if there are no optimizations that will break.



 [unaligned]: ../core_unsafety/dangling_and_unaligned_pointers.md
 [uninit-chapter]: ../undef_memory.md
 [`mem::transmute()`]: https://doc.rust-lang.org/stable/std/mem/fn.transmute.html
 [`mem::transmute_copy()`]: https://doc.rust-lang.org/stable/std/mem/fn.transmute_copy.html
 [`mem::zeroed()`]: https://doc.rust-lang.org/stable/std/mem/fn.zeroed.html
 [`NonNull<T>`]: https://doc.rust-lang.org/stable/std/ptr/struct.NonNull.html
 [`NonZeroUsize`]: https://doc.rust-lang.org/stable/std/num/struct.NonZeroUsize.html
 [reprc-enum]: https://doc.rust-lang.org/reference/type-layout.html#reprc-field-less-enums
 [the reference]: https://doc.rust-lang.org/reference/behavior-considered-undefined.html