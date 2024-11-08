// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded "><a href="introduction.html"><strong aria-hidden="true">1.</strong> Introduction</a></li><li class="chapter-item expanded "><a href="undefined_behavior.html"><strong aria-hidden="true">2.</strong> Undefined behavior</a></li><li class="chapter-item expanded "><a href="core_unsafety.html"><strong aria-hidden="true">3.</strong> Core unsafety</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="core_unsafety/dangling_and_unaligned_pointers.html"><strong aria-hidden="true">3.1.</strong> Dangling and unaligned pointers</a></li><li class="chapter-item expanded "><a href="core_unsafety/data_races.html"><strong aria-hidden="true">3.2.</strong> Data races</a></li><li class="chapter-item expanded "><a href="core_unsafety/intrinsics.html"><strong aria-hidden="true">3.3.</strong> Intrinsics</a></li><li class="chapter-item expanded "><a href="core_unsafety/abi_and_ffi.html"><strong aria-hidden="true">3.4.</strong> ABI and FFI</a></li><li class="chapter-item expanded "><a href="core_unsafety/platform_features.html"><strong aria-hidden="true">3.5.</strong> Platform features</a></li><li class="chapter-item expanded "><a href="core_unsafety/inline_assembly.html"><strong aria-hidden="true">3.6.</strong> Inline assembly</a></li></ol></li><li class="chapter-item expanded "><a href="advanced_unsafety.html"><strong aria-hidden="true">4.</strong> Advanced unsafety</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="advanced_unsafety/uninitialized.html"><strong aria-hidden="true">4.1.</strong> Uninitialized memory</a></li><li class="chapter-item expanded "><a href="advanced_unsafety/invalid_values.html"><strong aria-hidden="true">4.2.</strong> Invalid values</a></li><li class="chapter-item expanded "><a href="advanced_unsafety/pointer_aliasing.html"><strong aria-hidden="true">4.3.</strong> Pointer aliasing</a></li><li class="chapter-item expanded "><a href="advanced_unsafety/immutable_data.html"><strong aria-hidden="true">4.4.</strong> Immutable data</a></li><li class="chapter-item expanded "><a href="advanced_unsafety/atomic_ordering.html"><strong aria-hidden="true">4.5.</strong> Atomic ordering</a></li><li class="chapter-item expanded "><a href="advanced_unsafety/pinning.html"><strong aria-hidden="true">4.6.</strong> Pinning</a></li><li class="chapter-item expanded "><a href="advanced_unsafety/variance.html"><strong aria-hidden="true">4.7.</strong> Variance</a></li></ol></li><li class="chapter-item expanded "><a href="expert_unsafety.html"><strong aria-hidden="true">5.</strong> Expert unsafety</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="expert_unsafety/stacked_borrows.html"><strong aria-hidden="true">5.1.</strong> Stacked borrows</a></li><li class="chapter-item expanded "><a href="expert_unsafety/pointer_provenance.html"><strong aria-hidden="true">5.2.</strong> Pointer provenance</a></li></ol></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString();
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
