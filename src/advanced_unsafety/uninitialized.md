# Uninitialized memory

> _"I'm Nobody! Who are you? Are you — Nobody — too?"_
>
> — _Emily Dickinson_

While we have covered [invalid values], there's another thing that is a kind of invalid value, but has nothing to do with actual bit patterns: Uninitialized memory.


## Safely working with uninitialized memory

The basic rule of thumb is: never refer to uninitialized memory with anything other than a raw pointer or something wrapped in [`MaybeUninit<T>`]. Having a stack value or temporary that is uninitialized and has a type that is not `MaybeUninit<T>`  (or an array of `MaybeUninit`s) is always undefined behavior.

A good model for uninitialized memory is that there's an additional value that does not map to any concrete bit pattern (think of it as "byte value #257"), but can be introduced in the abstract machine in various ways, and makes _most_ values invalid.

Any attempt to read uninitialized bytes as an integer will be UB, and the presence of this byte in non-padding locations is considered UB for most types. The exceptions to this all fall out of treating it as a property of the byte:

 - Zero-sized types do not care about initialized-ness, since they do not have bytes
 - Unions do not care about initialized-ness if they have a variant that does not care about initialized-ness
 - [`MaybeUninit<T>`] does not care about initializedness since it is internally a union of `T` and a zero-sized type.
 - `[MaybeUninit<T>; N]` [does not care about initializedness][arr-maybeuninit] since it doesn't have any bytes that care about initializedness
 

Fundamentally, initializedness is a property of memory, but whether or not initializedness matters is a property of the *type*. For types that care about initializedness, typed operations working with uninitialized memory are typically UB, and having a value that contains uninitialized memory is immediately UB.

[`ptr::copy`] is explicitly an *untyped* copy, and thus it will copy all bytes, including padding, and including initialized-ness, to the destination, regardless of the type `T`.

Most other operations copying a type (for example, `*ptr` and `mem::transmute_copy`) will be typed, and will thus ignore padding and be UB if ever fed uninitialized memory in non-padding positions. This also applies to `let x = y` and `mem::transmute`, however in those cases if the source data were uninitialized that would already have been UB.


If you explicitly wish to work with uninitialized and partially-initialized types, [`MaybeUninit<T>`] is a useful abstraction since it can be constructed with no overhead and then written to in parts. It's also useful to e.g. refer to an uninitialized buffer with things like `&mut [MaybeUninit<u8>]`.


Similarly with invalid values, there are open issues ([UGC #77], [UGC #346]) about whether it is UB to have _references_ to uninitialized memory. When writing unsafe code we recommend you avoid creating such references, choosing to always use `MaybeUninit`, but when auditing unsafe code there may be causes where a reference to uninitialized values is actually safe as long as no uninitialized value is read out of it. In particular, [UGC #346] indicates that it is extremely unlikely that having `&mut` references to uninitialized values will be immediately UB.


## Sources of uninitialized memory

### `mem::uninitialized()` and `MaybeUninit::assume_init()`

[`mem::uninitialized()`] is a deprecated API that has a very tempting shape, it lets you do things like `let x = mem::uninitialized()` for cases when you want to construct the value in bits. It's almost _always_ UB to use, since it immediately sets `x` to uninitialized memory, which is UB, since uninitialized memory is a type of invalid value for almost all types, and it's unsound to produce invalid values.

Use [`MaybeUninit<T>`] instead.

It is still possible to create uninitialized values using [`MaybeUninit::assume_init()`] if you have not, in fact, assured that things are initialized.

### Padding

Padding bytes in structs and enums are [usually but not always uninitialized][pad-glossary]. This means that treating a struct as a bag of bytes (by, say, treating `&Struct` as `&[u8; size_of::<Struct>()]` and reading from there) is UB even if you don't write invalid values to those bytes, since you are accessing uninitialized `u8`s.

The "usually but not always" caveat can be usefully framed as "padding bytes are uninitialized unless proven otherwise". Padding is a property of types, not memory, and these bytes are set to being uninitialized whenever a type is created or copied/moved around, but they can be written to by getting a reference to the memory behind the type[^1], and will be preserved at that spot in memory as long as the type isn't overwritten as a whole.

For example, treating an initialized byte buffer as an `&Struct` and then later reading the padding bytes will give initialized values. However, treating an initialized byte buffer as an `&mut Struct` and then writing a new `Struct` to it will lead to those bytes becoming uninitialized since the `Struct` copy will "copy" the uninitialized padding bytes. Similarly, using `mem::transmute()` (or `mem::zeroed()`) to transmute a byte buffer to a `Struct` will have the padding be uninitialized, because a typed copy of the `Struct` is occurring.

Because [`ptr::copy`] is an untyped copy, it can be used to copy over explicitly-initialized padding.

See the discussion in [UGC #395][ugc395] for more examples.

### Unions

Reading a union type as the wrong variant can lead to reading uninitialized memory, for example if the union was initialized to a smaller variant, or if the padding of the two variants doesn't overlap perfectly.

Rust does not have strict aliasing like C and C++: type punning with a union is safe as long as the corresponding transmute is safe.

[`MaybeUninit<T>`] is actually just a union between `T` and `()` under the hood: the rules for correct usage of `MaybeUninit` are the same as the rules for correct usage of a union.

### Freshly allocated memory

Freshly allocated memory (e.g. the yet-unused bytes in [`Vec::with_capacity()`] or just the result of [`Allocator::allocate()`]) is usually uninitialized. You can use APIs like [`Allocator::allocate_zeroed()`] if you wish to avoid this, though you can still end up making [invalid values] the same way you can with [`mem::zeroed()`].

Generally after allocating memory one should make sure that the only part of that memory being read from is known to have been written to. This can be tricky in situations around complex data structures like probing hashtables where you have a buffer which only has some segments initialized, determined by complex conditions.

### Not exactly uninitialized: Moved-from values

The following code is UB:

```rust
# use std::ptr;
let x = String::new(); // String is not Copy
let mut v = vec![];
let ptr = &x as *const String;

v.push(x); // move x into the vector

unsafe {
    // dangling pointer reads from moved-from memory
    let ghost = ptr::read(ptr);
}
```

Any type of move will do this, even when you "move" the value into a different variable with stuff like `let y = x;`.

This isn't _quite_ uninitialized: it's just that using after a move is straight up UB in Rust. In particular, unlike most pointers to uninitialized values, this dangling pointer is unsound to *write* to as well.

Working with dangling pointers can often lead to similar problems as working with uninitialized values.

Note that Rust does let you "partially move" out of fields of a struct, in such a case the whole struct is now no longer a valid value for its type, but you are still allowed to "use" the struct to look at other fields, and the value as a whole is no longer usable. When doing such things, make sure there are no pointers that still think the struct is whole and valid.

#### Caveat: `ptr::drop_in_place()`, `ManuallyDrop::drop()`, and `ptr::read()`

[`ptr::drop_in_place()`] and [`ManuallyDrop::drop()`] are interesting: they both call the destructor[^2] on a value (or a pointed-to value in the case of `drop_in_place`). From the perspective of safety they are identical; they are just different APIs for dealing with manually calling destructors.

[`ManuallyDrop::drop()`] makes the following claim:

> Other than changes made by the destructor itself, the memory is left unchanged, and so as far as the compiler is concerned still holds a bit-pattern which is valid for the type T.

In other words, Rust does _not_ consider these operations to do the same invalidation as a regular "move from" operation, even though they may have a similar feel. They do not create dangling pointers, and they do not themselves overwrite the memory with an uninitialized value.

There is an [open issue][ugc-394] about whether `Drop::drop()` is itself allowed to produce uninitialized or invalid memory, so it may not be possible to rely on this in a generic context.

[`ptr::read()`] similarly claims that it leaves the source memory untouched, which means that it is still a valid value. Of course, [`ptr::read()`] on a pointer pointing to uninitialized memory will still create an uninitialized value.


For all of these APIs, actually _using_ the dropped or read-from memory may still be fraught depending on the invariants of the value; it's quite easy to cause a double-free by materializing an owned value from the original data after it has already been read-from or dropped.

However, they do not produce uninitialized memory.

## When you might end up making an uninitialized value

Some of the APIs and methods above create uninitialized memory in a pretty straightforward way — don't call [`MaybeUninit::assume_init()`] if things are not actually initialized!

When writing tricky data structures you may end up mistakenly assuming uninitialized memory is initialized. For example imagine building a probing hashmap, backed with allocated memory: only inhabited buckets will be initialized, and if your logic for determining which buckets are inhabited is broken, your code may risk producing uninitialized values.

A subtle case is when you *write* to uninitialized memory the wrong way. The following code uses a write to a `*mut String` that is pointing to uninitialized memory, and exhibits undefined behavior:

```rust,no_run
# use std::mem::MaybeUninit;
let mut val: MaybeUninit<String> = MaybeUninit::uninit();
let ptr: *mut String = val.as_mut_ptr();
unsafe {
    // UB!
    *ptr = String::from("hello world");
}
```

This is UB because writing to raw pointers, under the hood, still calls destructors on the old value, the same way a write to an `&mut T` does. This is usually quite convenient, but here the old value is uninitialized, and calling a destructor on it is undefined.

APIs like [`ptr::write()`] and [`MaybeUninit::write()`] exist to sidestep this problem. Logically, a write to a raw pointer is functionally the same as a [`ptr::read()`] of the pointer (with the read-value being dropped) followed by a [`ptr::write()`] with the new value.

## Signs an uninitialized value was involved

This is largely similar to the situation for [invalid values]: The compiler is allowed to assume memory is never uninitialized, and since uninitialized memory is a kind of invalid value, all of the failure modes of [invalid values] are possible.

Often when reading from uninitialized memory you'll see reads to the same, unchanged, memory producing different values.

This is not an exhaustive list: ultimately, having an uninitialized value is UB and it remains illegal even if there are no optimizations that will break.



 [invalid values]: ../core_unsafety/invalid_values.md
 [`mem::uninitialized()`]: https://doc.rust-lang.org/stable/std/mem/fn.uninitialized.html
 [`mem::zeroed()`]: https://doc.rust-lang.org/stable/std/mem/fn.zeroed.html
 [`MaybeUninit<T>`]: https://doc.rust-lang.org/stable/std/mem/union.MaybeUninit.html
 [`MaybeUninit::assume_init()`]: https://doc.rust-lang.org/stable/std/mem/union.MaybeUninit.html#method.assume_init
 [`MaybeUninit::write()`]: https://doc.rust-lang.org/stable/std/mem/union.MaybeUninit.html#method.write
 [pad-glossary]: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/reference/src/glossary.md#padding
 [`ptr::drop_in_place()`]: https://doc.rust-lang.org/stable/std/ptr/fn.drop_in_place.html
 [`ManuallyDrop::drop()`]: https://doc.rust-lang.org/stable/std/mem/struct.ManuallyDrop.html#method.drop
 [`ptr::read()`]: https://doc.rust-lang.org/stable/std/ptr/fn.read.html
 [`ptr::write()`]: https://doc.rust-lang.org/stable/std/ptr/fn.write.html
 [ugc-394]: https://github.com/rust-lang/unsafe-code-guidelines/issues/394
 [`Vec::with_capacity()`]: https://doc.rust-lang.org/stable/std/vec/struct.Vec.html#method.with_capacity
 [`Allocator::allocate()`]: https://doc.rust-lang.org/stable/std/alloc/trait.Allocator.html#tymethod.allocate
 [`Allocator::allocate_zeroed()`]: https://doc.rust-lang.org/stable/std/alloc/trait.Allocator.html#method.allocate_zeroed
 [ugc-395]: https://github.com/rust-lang/unsafe-code-guidelines/issues/395
 [UGC #77]: https://github.com/rust-lang/unsafe-code-guidelines/issues/77
 [UGC #346]: https://github.com/rust-lang/unsafe-code-guidelines/issues/346
 [arr-maybeuninit]: https://doc.rust-lang.org/stable/std/mem/union.MaybeUninit.html#initializing-an-array-element-by-element
 [`ptr::copy`]: https://doc.rust-lang.org/stable/std/ptr/fn.copy.html

 [^1]: Be sure to use `&[MaybeUninit<u8>]` if treating a type with uninitialized padding as manipulatable memory!
 [^2]: The "destructor" is different from the `Drop` trait. Calling the destructor is the process of calling a type's `Drop::drop` impl if it exists, and then calling the destructor for all of its fields (also known as "drop glue"). I.e. it's not _just_ `Drop`, but rather the entire _destruction_, of which the destructor is one part. Types that do not implement `Drop` may still have contentful destructors if their transitive fields do.
 