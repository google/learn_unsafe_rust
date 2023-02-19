# Undefined behavior

> _“People shouldn't call for demons unless they really mean what they say.”_
>
> — _C.S. Lewis, The Last Battle_

"Undefined behavior" is a bit of a strange notion. On one hand, the reference
[clearly defines][reference_ub] some (but not all) causes of undefined behavior.
This list includes some causes that are generally well-known: dereferencing a
null pointer, causing a data race, executing incorrect inline assembly. These
all have a direct translation for real, common machines and so it is common to
misunderstand "undefined behavior" to be "platform-specific behavior". Maybe on
x86 it will continue on, perhaps on ARM it will cause a fault. While this can be
true, undefined behavior is usually more nuanced because of:

## Abstract machines

High-level programming languages allow programming for a wide variety of targets
by abstracting away the specific properties of each one, and targeting a single
"abstract machine". C and C++ have their own "abstract machines", and so does
Rust. This means that the semantics and rules of an abstract machine depend
heavily on the language that it's for.

When we write Rust code, we're writing code for this abstract machine. We're not
writing code that follows the rules for some set of targets; there is only one
set of rules for the abstract machine. It's just that the _consequences_ for
breaking those rules depends on the target and the compiler itself. With this
perspective, it's easier to see that undefined behavior is platform-independent.

## Rust's abstract machine

Rust's abstract machine has not been rigorously defined, and it may never be.
Efforts to rigorously define Rust's abstract machine are usually colloquially
called "standardizing Rust". You may even have heard of some of these efforts,
like the [Ferrocene Language Specification][ferrocene]. It's important to note
that these standards are for _some language arbitrarily close to Rust_; they're
not standards for the official Rust language.

Rather than describing the entirety of Rust's abstract machine, Rust's official
reference has defined just some of the rules of the abstract machine. Breaking
one of these rules definitely results in undefined behavior. These are the rules
that we'll cover in the [Core unsafety](./core_unsafety.md) and
[Advanced unsafety](./advanced_unsafety.md) volumes. There are also ideas about
undefined behavior that are being explored right now, but they haven't been
officially adopted as rules yet. Some of these are covered in the
[Expert unsafety](./expert_unsafety.md) volume.

## Triggering undefined behavior

Undefined behavior in Rust is always triggered by some condition being met, and
usually this condition is just "some code getting executed in a particular way"
or "some code violating an invariant upheld by the compiler". Because of this,
it's often tempting to think of undefined behavior as telling your program "if
you get here, do whatever you want". However, undefined behavior is a purely
compile-time concept. It's not telling your program "do whatever you want", it's
telling the compiler "assume this can never happen". The compiler may not have a
better response than saying "if you get here, panic". Or, it may be able to use
that promise to better optimize your code.

As an example, consider this Rust code:

```rust
use std::hint::unreachable_unchecked;

unsafe fn char_to_int(c: char) -> u8 {
    match c {
        '0' => 0,
        '1' => 1,
        '2' => 2,
        '3' => 3,
        '4' => 4,
        '5' => 5,
        '6' => 6,
        '7' => 7,
        '8' => 8,
        '9' => 9,
        _ => unsafe { unreachable_unchecked() },
    }
}
```

This converts a char `'0'..'9'` to its corresponding integer value. In the last
arm of the match, we call `unreachable_unchecked()`, which is a compiler hint
that says "it would be undefined behavior to reach here". Because we promised
the compiler that `c` won't be any value other than `0..9`, it could optimize
this function into something like:

```rust
unsafe fn char_to_int(c: char) -> u8 {
    c as u8 - b'0'
}
```

Consider what would happen if we called `char_to_int('A')`. `'A'` has a value of
`65` as a `u8`, and `'0'` has a value of `48` as a `u8`. So the optimized
version of our function would return `17`. But what if the compiler chose to
optimize our function a different way instead:

```rust
unsafe fn char_to_int(c: char) -> u8 {
    c as u8 & 0b1111
}
```

This does the same thing as our original version for all characters `'0'..'9'`.
Now consider what _this version_ of our function would do if we called
`char_to_int('A')`. `'A'` has a value of `65` (`0b0010_0001` in binary
notation), so this version would return `0010_0111 & 0000_1111 = 0111 = 15`.
This is a different result than we would have gotten with the previous
optimization!

Finally, consider this version:

```rust
unsafe fn char_to_int(c: char) -> u8 {
    let c = c as u8;
    if c < b'0' || c > b'9' {
        panic!()
    } else {
        c - b'0'
    }
}
```

This version doesn't return anything, it panics! In fact, the compiler would be
allowed to put _anything_ in where the `panic!()` is located; the resulting
function would be just as correct and optimal as this one.

This strikes at the core of what "undefined behavior" is. The Rust compiler
transforms code based on a set of assumptions that always hold. If you break one
of these assumptions, then the behavior of your program is undefined because
it's impossible to know what transforms the compiler is doing based on them.

## Unsoundness

Now that we know exactly what undefined behavior is, we can understand what it
means for some Rust code to be _unsound_. Unsound code refers to either:

- An abstraction (e.g. a function or a trait) that can trigger undefined
  behavior even when used as prescribed.
- A particular invocation of unsafe code that causes undefined behavior under
  allowed circumstances.

This leads to two broad rules:

### If you can trigger undefined behavior with purely safe code, it's unsound

In purely safe code (that is, code that contains no `unsafe` blocks), the
compiler is in charge of enforcing all of the rules to avoid undefined behavior.
If we somehow manage to cause undefined behavior, then there must be some API
that we use which is unsound.

This is also why it can be difficult to build safe abstractions around unsafe
code. It's your job as the abstraction designer to make sure that no possible
arrangement of safe code can cause undefined behavior. That's a lot to consider!

### Unsafe code must accurately document its safety conditions, or it's unsound

The "safey conditions" for unsafe traits and functions are just the conditions
under which it does not trigger undefined behavior. These conditions aren't
checked by the compiler, they're checked by the people who write the code
itself. Therefore, unsafe blocks must be manually checked to verify that the
code written upholds all of the conditions required to avoid undefined behavior.
Any unsafe code that can trigger undefined behavior _even when its safey
conditions are upheld_ is unsound.


## Common misconceptions

There are a couple misconceptions about UB that often muddy the water when talking about it.

### "If it works, it's sound"

Undefined Behavior may be present even if the compiler does end up compiling the
code according to the programmer's intent. A future version of the compiler may
behave differently, or future changes to an innocuous portion of the code may
cause it to fall to the other side of an invisible threshhold. Technically it
may even compile differently but only on Tuesdays, though that type of
nondeterminism is generally rare.


### "UB is about what the optimizer is allowed to do"

This is to _some extent_ true but the actual situation is far more nuanced.

It's common for people to think about UB in terms of what an optimizer "is and
isn't allowed to do", and in terms of optimizations they know can occur. For
example, it's pretty straightforward to see that sneakily writing to memory
that you're not supposed to can cause undefined behavior when the optimizer
decides to elide a memory read that occurs after your illicit write.

Firstly, some forms of UB just have to do with rules the underlying processor
enforces.

But more than that, there are plenty of miscompiles that are hard to explain by
simply thinking in terms why the optimizer would do such a thing.

This is because it's less about what the optimizer is "allowed to do" and more
about what it is "allowed to assume". When a code has UB, the optimizer may
make an incorrect assumption that snowballs into bigger and bigger incorrect
assumptions that cause very unexpected behavior.

It's often very _useful_ to think of potential optimizations the optimizer may
do around your code, but that is not sufficient for evaluating whether your
code has UB.


[reference_ub]: https://doc.rust-lang.org/reference/behavior-considered-undefined.html
[ferrocene]: https://ferrous-systems.com/blog/the-ferrocene-language-specification-is-here/
