# Learn unsafe Rust

*This project is currently a work in progress.*

This repository holds the mdbook source for *Learn unsafe Rust*, a compassionate and comprehensive resource for learning unsafe Rust. To that end, it:

- Links to authoritative external documentation on unsafe operations.
- Explains technical documentation with prose and supporting information.
- Provides examples and case studies that relate to real-world applications.

## Structure

*Learn unsafe Rust* is structured into three major sections:

1. Core unsafety: an introduction using semantics of concrete machines
    - Invalid values
    - Dangling and unaligned pointers
    - Data races
    - Intrinsics
    - ABI and FFI
    - Platform features
    - Inline assembly
1. Advanced unsafety: a more complete view of unsafety in abstract machines
    - Pointer aliasing
    - Immutable data
    - Atomic ordering
    - Undef memory
    - Pinning
    - Variance
1. Expert unsafety: non-standard and experimental unsafety
    - Stacked borrows
    - Pointer provenance

## Contributing

See our `CONTRIBUTING` file for directions on how to contribute.

*Learn unsafe Rust* accepts issues and PRs filed against this repository. Good topics of contribution include:

- Adding, removing, or revising content in the book.
- Methods used to generate artifacts from the book.

*Learn unsafe Rust* is written primarily in markdown and compiled using [`mdBook`](https://github.com/rust-lang/mdbook). See the [`mdBook` User Guide](https://rust-lang.github.io/mdBook) for information on installing and using `mdBook`.

In order to keep activity relevant and narrowly-focused, the following activity is discouraged:

- Nontrivial discussions regarding soundness and undefined behavior. These should be moved to more public and relevant repositories, and the discussion should be linked to from here. For example, the [UCG working group repository](https://github.com/rust-lang/unsafe-code-guidelines) is a good place for discussions about unsafe code.
- Experimental unsafety topics that do not have substantial documentation. Because experimental topics are volatile and liable to change, it's a bad idea to invest effort where it's prone to be wasted.

## Disclaimer

*Learn unsafe Rust* is not an officially-supported Google project.
