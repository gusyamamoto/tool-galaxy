// Local, presentation-only help. Native dialog/details provide keyboard behavior.
(() => {
    const trigger = document.getElementById('help-button');
    const dialog = document.getElementById('help-dialog');
    trigger.addEventListener('click', () => {
        if (dialog.open) return;
        dialog.showModal();
    });
    document.getElementById('close-help-button').addEventListener('click', () => dialog.close());
    // Keep Escape and navigation keys inside Help, without dismissing content
    // or an active Constellation behind it. Native cancel remains supported too.
    dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); dialog.close(); return; }
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button, summary, a[href], [tabindex="0"]')]
            .filter(control => !control.disabled && control.getClientRects().length);
        const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
            : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null;
        if (target) { event.preventDefault(); target.focus(); }
    });
    dialog.addEventListener('close', () => {
        const target = trigger.getClientRects().length ? trigger : document.getElementById('sidebar-toggle');
        target.focus({preventScroll: true});
    });
    dialog.querySelectorAll('details').forEach(topic => {
        const summary = topic.querySelector('summary');
        const sync = () => summary.setAttribute('aria-expanded', String(topic.open));
        sync();
        topic.addEventListener('toggle', sync);
    });
})();
