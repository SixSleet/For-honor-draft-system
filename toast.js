// Lightweight toast notifications — replaces alert() everywhere in the
// app so validation/rule messages ("Character unavailable", "Team
// full", ...) show as a small dismissing card instead of a native
// dialog that blocks the whole tab. Bottom-right, stacks newest-on-top,
// auto-dismisses. The container is created lazily on first use so any
// module can import showToast() without index.html needing to know
// about it.
let container = null;

function getContainer() {
    if (container) return container;

    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toastContainer";
    document.body.appendChild(container);

    return container;
}

export function showToast(message, kind = "error") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = `
        <span class="toastIcon">${kind === "error" ? "⚠" : "ℹ"}</span>
        <span class="toastMsg">${message}</span>
    `;

    getContainer().appendChild(el);

    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 300);
    }, 3200);
}
