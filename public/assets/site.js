// Дополнительные взаимодействия. Содержимое страниц заранее написано в HTML.
document.documentElement.classList.add('js');
const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.main-nav');
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menu?.classList.toggle('is-open', open);
});

function setError(form, name, message) {
  const field = form.elements[name];
  const error = form.querySelector('[data-error-for="' + name + '"]');
  if (field?.setAttribute) field.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) error.textContent = message;
}

document.querySelectorAll('[data-request-form]').forEach((form) => {
  form.noValidate = true;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    ['name', 'phone', 'email', 'message', 'consent'].forEach((name) => setError(form, name, ''));
    let valid = true;
    if ((data.name || '').trim().length < 2) { setError(form, 'name', 'Укажите имя'); valid = false; }
    if (!(data.phone || '').trim() && !(data.email || '').trim()) { setError(form, 'phone', 'Укажите телефон или email'); valid = false; }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { setError(form, 'email', 'Проверьте email'); valid = false; }
    if (form.elements.message?.required && !(data.message || '').trim()) { setError(form, 'message', 'Опишите задачу'); valid = false; }
    if (!data.consent) { setError(form, 'consent', 'Необходимо согласие'); valid = false; }
    if (!valid) return;
    const button = form.querySelector('button[type=submit]');
    const status = form.querySelector('.form-status');
    button.disabled = true; status.className = 'form-status'; status.textContent = 'Отправляем…';
    try {
      if (location.protocol === 'file:') throw new Error('Для отправки заявки откройте сайт через локальный сервер или хостинг.');
      const response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось отправить заявку');
      status.classList.add('is-success'); status.textContent = result.message; form.reset();
    } catch (error) {
      status.classList.add('is-error'); status.textContent = error.message || 'Ошибка соединения. Попробуйте ещё раз.';
    } finally { button.disabled = false; }
  });
});
