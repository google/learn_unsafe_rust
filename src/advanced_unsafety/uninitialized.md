# Uninitialized memory

> _"I'm Nobody! Who are you? Are you — Nobody — too?"_
>
> — _Emily Dickinson_

While we have covered [invalid values], there's another thing that behaves a lot like invalid values, but has nothing to do with actual bit patterns: Uninitialized memory.

An easy way to think about uninitialized memory is that there's an additional value (often called `undef` using LLVM's term for it) that does not map to any concrete bit pattern, but can be introduced in abstract in various ways, and makes _most_ values invalid.

If you explicitly wish to work with uninitialized and partially-initialized types, [`MaybeUninit<T>`] is a useful abstraction since it can be "initialized" with no overhead and then written to in parts.

## Sources of uninitialized memory

### `mem::uninitialized()` and `MaybeUninit::assume_init()`

[`mem::uninitialized()`] is a deprecated API that has a very tempting shape, it lets you do things like `let x = mem::uninitialized()` for cases when you want to construct the value in bits. It's basically _always_ UB to use, since it immediately sets `x` to uninitialized memory, which is UB.

Use [`MaybeUninit<T>`] instead.

It is still possible to create uninitialized memory using [`MaybeUninit::assume_init()`] if you have not, in fact, assured that things are initialized.

### Padding

Padding bytes in structs and enums are often but not always uninitialized. This means that treating a struct as a bag of bytes (by, say, treating `&Struct` as `&[u8; size_of::<Struct>()]` and reading from there) is UB even if you don't write invalid values to those bytes, since you are ginning up uninitialized `u8`s.

Reading from padding [always produces uninitialized values][pad-glossary].



### Moved-from values

The following code is UB:

```rust
# use std::ptr;
let x = String::new(); // String is not Copy
let mut v = vec![];
let ptr = &x as *const String;

v.push(x); // move x into the vector

unsafe {
    // reads from moved-from memory
    let ghost = ptr::read(ptr);
}
```

Any type of move will do this, even when you "move" the value into a different variable with stuff like `let y = x;`.

Note that Rust does let you "partially move" out of fields of a struct, in such a case the whole struct is now no longer a valid value for its type, but you are still allowed to "use" the struct to look at other fields. When doing such things, make sure there are no pointers that still think the struct is whole and valid.

#### Caveat: `ptr::drop_in_place()`, `ManuallyDrop::drop()`, and `ptr::read()`

[`ptr::drop_in_place()`] and [`ManuallyDrop::drop()`] are interesting: they call all the destructor[^1] on a value (or a pointed-to value in the case of the former). From a safety point of view they are identical; they are just different APIs for dealing with manually calling drop glue.

[`ManuallyDrop::drop()`] makes the following claim:

> Other than changes made by the destructor itself, the memory is left unchanged, and so as far as the compiler is concerned still holds a bit-pattern which is valid for the type T.

In other words, Rust does _not_ consider these operations to do the same invalidation as a regular "move from" operation, even though they have a similar feel.

There is an [open issue][ugc-394] about whether `Drop::drop()` is itself allowed to produce uninitialized or invalid memory, so it may not be possible to rely on this in a generic context.

[`ptr::read()`] similarly claims that it leaves the source memory untouched, which means that it is still a valid value. Of course, [`ptr::read()`] on a pointer pointing to uninitialized memory will still create an uninitialized value.


For all of these APIs, actually _using_ the dropped or read-from memory may still be fraught depending on the invariants of the value; it's quite easy to cause a double-free by materializing an owned value from the original data after it has already been read-from or dropped.

However, they do not produce uninitialized memory.


### Freshly allocated memory

Freshly allocated memory (e.g. the yet-unused bytes in [`Vec::with_capacity()`] or just the result of [`Allocator::allocate()`]) is usually uninitialized. You can use APIs like [`Allocator::zeroed()`] if you wish to avoid this, though you can still end up making [invalid values] the same way you can with [`mem::zeroed()`].

Generally after allocating memory one should make sure that the only part of that memory being read from is known to have been written to. This can be tricky in situations around complex data structures like probing hashtables where you have a buffer which only has some segments initialized, determined by complex conditions.

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
 [`Allocator::zeroed()`]: https://doc.rust-lang.org/stable/std/alloc/trait.Allocator.html#method.allocate_zeroed


 [^1]: The "destructor" is different from the `Drop` trait. Calling the destructor is the process of calling a type's `Drop::drop` impl if it exists, and then calling the destructor for all of its fields (also known as "drop glue"). I.e. it's not _just_ `Drop`, but rather the entire _destruction_, of which the destructor is one part. Types that do not implement `Drop` may still have contentful destructors if their transitive fields do.
 