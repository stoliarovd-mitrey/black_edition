const navigation = document.querySelector('.site-navigation');
const menuButton = document.querySelector('.hamburger');
const navButtons = Array.from(navigation.querySelectorAll('.nav-heading'));

function closeGroups(except) {
  for (const button of navButtons) {
    if (button === except) continue;
    button.setAttribute('aria-expanded', 'false');
    button.nextElementSibling.hidden = true;
  }
}

function setMobileMenu(expanded) {
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
  navigation.classList.toggle('is-open', expanded);
  if (!expanded) closeGroups();
}

for (const button of navButtons) {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    closeGroups(button);
    button.setAttribute('aria-expanded', String(!expanded));
    button.nextElementSibling.hidden = expanded;
  });
}

menuButton.addEventListener('click', () => {
  setMobileMenu(menuButton.getAttribute('aria-expanded') !== 'true');
});

document.addEventListener('click', event => {
  if (!event.target.closest('.site-header')) setMobileMenu(false);
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (navigation.classList.contains('is-open')) {
    setMobileMenu(false);
    menuButton.focus();
  } else {
    const visibleGroup = navButtons.find(button => button.getAttribute('aria-expanded') === 'true');
    closeGroups();
    visibleGroup?.focus();
  }
});

const gallery = document.querySelector('.category-selector');
if (gallery) {
  const links = Array.from(gallery.querySelectorAll('a'));
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));

  function showCategory(hash) {
    const activeLink = links.find(link => link.hash === hash) || links[0];
    for (const [index, link] of links.entries()) {
      const active = link === activeLink;
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
      sections[index].hidden = !active;
    }
  }

  gallery.classList.add('is-ready');
  for (const link of links) {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      showCategory(link.hash);
    });
  }

  window.addEventListener('popstate', () => showCategory(location.hash));
  showCategory(location.hash);
}

const slider = document.querySelector('[data-slider]');
if (slider) {
  const slides = Array.from(slider.querySelectorAll('.home-slide'));
  const buttons = Array.from(slider.querySelectorAll('.slider-controls button'));
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => {
      for (const [position, slide] of slides.entries()) {
        const active = position === index;
        slide.hidden = !active;
        buttons[position].setAttribute('aria-pressed', String(active));
      }
    });
  }
}
