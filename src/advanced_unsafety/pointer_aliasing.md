# Pointer aliasing

> _"What's in a name? That which we call a rose / by any other name would smell
> as sweet;"_
>
> — _William Shakespeare_

In Rust, references are said to _alias_ the value they point to. But what
exactly _is_ aliasing, and why are shared and mutable references said to differ
in their aliasing?

## Optimization

Consider the following bit of low-level code that uses pointers:

```rust
unsafe fn copy_twice(from: *const u8, to_1: *mut u8, to_2: *mut u8) {
    to_1.write(from.read());
    to_2.write(from.read());
}
```

It copies `from` to `to_1` and `to_2`. Popping this into [compiler explorer]
yields:

```assembly
example::copy_twice:
  mov al, byte ptr [rdi]
  mov byte ptr [rsi], al
  mov al, byte ptr [rdi]
  mov byte ptr [rdx], al
  ret
```

The sharp-eyed may spot that we're doing the same operation twice:

```assembly
  mov al, byte ptr [rdi]
```

This loads the byte at `from` into a register, which we then use to set a byte
pointed to by another register. We do this before writing each byte.

Now let's look at the more idiomatic assembly for this function, written with
references:

```rust
fn copy_twice(from: &u8, to_1: &mut u8, to_2: &mut u8) {
    *to_1 = *from;
    *to_2 = *from;
}
```

Apart from using references, nothing is different about this code. However, the
assembly generated for this function is better:

```assembly
example::copy_twice:
  mov al, byte ptr [rdi]
  mov byte ptr [rsi], al
  mov byte ptr [rdx], al
  ret
```

Using references got rid of that extra load that we spotted earlier! But why?

## Aliasing in Rust

Aliasing tells the compiler how some pointed-to value can change, and for how
long that restriction lasts. There are two kinds of references in Rust, each
with their own kind of aliasing:

- Shared references (`&T`) assert _shared aliasing_ over the value they point
  to.
- Unique references (`&mut T`) assert _unique aliasing_ over the value they
  point to.

You may have sometimes heard shared references called _immutable references_,
and unique references called _mutable references_. In many situations, this
terminology is fine, but when reasoning about aliasing we prefer to use the
more precise terms _shared_ and _unique_. This is because while aliasing is
_related_ to whether a value is mutable, it's not a strict correlation (for
example, when a type has [interior mutability]).

When we create some reference `&'a T`, we're telling the compiler that the value
that reference points to will not change for `'a`. This is why it's sometimes
called an immutable reference. Because the value will not change, it's safe to
create multiple shared references to the same value. Effectively, this says "the
value may be observed from many places, but will not change".

When we create some reference `&'a mut T`, we're telling the compiler that the
value that reference points to _may_ change for `'a`, but only by modifying
through that reference. Because the value may change, it also means that a value
aliased by a `&mut T` cannot be aliased by any other references, shared or
unique. This is a much stronger guarantee than the one for shared references, as
it says "this value may only be observed and changed from exactly one place".
Critically, the aliasing for unique references is a _strict superset_ of the
aliasing for shared references. It is always valid to replace a shared reference
with a unique one, and unique references can be weakened to shared references by
reborrowing.

Aliasing information lasts as long as the lifetime of the reference that asserts
it, even if the reference doesn't last that long. So if you ever created a
`&'static mut T` of some value, you can never create another reference to it
again - shared or unique.

## Applying pointer aliasing

With the explanation out of the way, we can take another look at our example
from earlier:

```rust
unsafe fn copy_twice(from: *const u8, to_1: *mut u8, to_2: *mut u8) {
    to_1.write(from.read());
    to_2.write(from.read());
}
```

Since we're doing operations with just raw pointers, there's no aliasing being
asserted anywhere in this example. Since we're not guaranteed anything about the
pointers we've been given, we have to assume that every write through a pointer
could affect the value read from others. So when we do:

```rust
to_1.write(from.read());
```

this writes a byte to `to_1`, thus potentially affecting the value read from
every other pointer in the future. In this case, the next `from.read()` could
have be affected. This means that the compiler cannot skip that `read()` call,
because the value might have changed! Thus the second `from.read()` gets
compiled in, whether we actually needed it or not.

Compare that with the same code using references:

```rust
fn copy_twice(from: &u8, to_1: &mut u8, to_2: &mut u8) {
    *to_1 = *from;
    *to_2 = *from;
}
```

All of the references here have elided lifetimes, so let's be a little more
explicit and annotate them:

```rust
fn copy_twice<'f, 't1, 't2>(
    from: &'f u8,
    to_1: &'t1 mut u8,
    to_2: &'t2 mut u8,
) {
    *to_1 = *from;
    *to_2 = *from;
}
```

Alright, we have three distinct lifetimes: `'f` is the lifetime of the `from`
reference, and `t1` and `t2` are the lifetimes of the two `to` references. Let's
apply our aliasing rules:

- The value pointed to by `from` will not change for `'f`.
- The value pointed to by `to_1` can only be modified through `to_1` for `'t1`.
- The value pointed to by `to_2` can only be modified through `to_2` for `'t2`.

Equipped with this knowledge, we can see how we only ever need to read `from`
once. Since it won't change for `'f` (which outlasts our function call), nothing
that we do during our function will ever change its value! Thus, we can just
read it once and then write the same value to `to_1` and `to_2`.

## `UnsafeCell` and interior mutability



[compiler explorer]: https://godbolt.org
[interior mutability]: #unsafecell-and-interior-mutability
