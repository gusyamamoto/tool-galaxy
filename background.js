// Stable star fields at three depths. This renderer runs only on load/resize.
function createUniverseBackground(galaxy) {
    const layers = [...galaxy.querySelectorAll(".star-layer")];
    const settings = [
        { area: 15000, minimum: 35, maximum: 125, opacity: 0.28 },
        { area: 45000, minimum: 12, maximum: 40, opacity: 0.4 },
        { area: 140000, minimum: 4, maximum: 12, opacity: 0.58 }
    ];

    function render() {
        const { width, height } = galaxy.getBoundingClientRect();
        layers.forEach((layer, depth) => {
            let seed = 1947 + depth * 7919;
            const random = () => {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            const setting = settings[depth];
            const count = Math.max(setting.minimum, Math.min(setting.maximum,
                Math.round(width * height / setting.area)
            ));
            const stars = Array.from({ length: count }, () => {
                const x = Math.round(random() * width);
                const y = Math.round(random() * height);
                const opacity = (setting.opacity + random() * 0.24).toFixed(2);
                return `${x}px ${y}px 0 0 rgba(221, 231, 250, ${opacity})`;
            });
            layer.style.boxShadow = stars.join(",");
        });
    }

    render();
    return render;
}
