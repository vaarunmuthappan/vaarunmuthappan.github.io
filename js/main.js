document.addEventListener('DOMContentLoaded', function () {
    // Handle dropdown menu
    const dropdowns = document.querySelectorAll('.dropdown');

    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('mouseover', function () {
            this.querySelector('.dropdown-content').style.display = 'block';
        });

        dropdown.addEventListener('mouseout', function () {
            this.querySelector('.dropdown-content').style.display = 'none';
        });
    });
});