const filters = document.querySelectorAll('.filter[data-filter]');
    const cards = document.querySelectorAll('.extra-card');
    filters.forEach((button) => {
      button.addEventListener('click', () => {
        const selected = button.dataset.filter;
        filters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        cards.forEach((card) => {
          card.hidden = selected !== 'todos' && card.dataset.category !== selected;
        });
      });
    });

    const foodDayFilters = document.querySelectorAll('.food-day-filter');
    const foodTypeFilters = document.querySelectorAll('.food-type-filter');
    const foodCards = document.querySelectorAll('.food-card');
    const foodCount = document.getElementById('food-count');
    let selectedFoodDay = 'todos';
    let selectedFoodType = 'todos';
    function applyFoodFilters() {
      let visibleCount = 0;
      foodCards.forEach((card) => {
        const dayMatches = selectedFoodDay === 'todos' || card.dataset.foodDay === selectedFoodDay;
        const typeMatches = selectedFoodType === 'todos' || card.dataset.foodCategory === selectedFoodType;
        card.hidden = !(dayMatches && typeMatches);
        if (!card.hidden) visibleCount += 1;
      });
      foodCount.textContent = `Mostrando ${visibleCount} de ${foodCards.length} lugares.`;
    }
    foodDayFilters.forEach((button) => button.addEventListener('click', () => {
      selectedFoodDay = button.dataset.foodDay;
      foodDayFilters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      applyFoodFilters();
    }));
    foodTypeFilters.forEach((button) => button.addEventListener('click', () => {
      selectedFoodType = button.dataset.foodType;
      foodTypeFilters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      applyFoodFilters();
    }));
