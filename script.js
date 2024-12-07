document.addEventListener('DOMContentLoaded', function () {
    const definitions = document.querySelectorAll('.definition');

    definitions.forEach(def => {
        def.addEventListener('mouseover', function () {
            this.style.backgroundColor = '#e0e0e0';
        });

        def.addEventListener('mouseout', function () {
            this.style.backgroundColor = 'lightgrey';
        });
    });
});