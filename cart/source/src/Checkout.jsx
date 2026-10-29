import React, {useState} from 'react';
import './checkout.css';

const site = 'https://caviar-phones.ru';

export default function Checkout() {
  const [previewSubmitted, setPreviewSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setPreviewSubmitted(true);
  }

  return (
    <main className="checkout-page" id="checkout">
      <h1>ОФОРМЛЕНИЕ ЗАКАЗА</h1>
      <form className="checkout-form" onSubmit={handleSubmit}>
        <section className="checkout-section">
          <h2>Контактная информация</h2>
          <select className="checkout-control" name="country" defaultValue="" aria-label="Страна" required>
            <option value="" disabled>Страна</option>
            <option value="ru">Россия</option>
            <option value="ae">Объединённые Арабские Эмираты</option>
            <option value="gb">Великобритания</option>
            <option value="other">Другая страна</option>
          </select>
          <div className="checkout-two-col">
            <input className="checkout-control" name="firstName" placeholder="Имя" aria-label="Имя" autoComplete="given-name" required />
            <input className="checkout-control" name="lastName" placeholder="Фамилия" aria-label="Фамилия" autoComplete="family-name" required />
          </div>
          <div className="checkout-two-col">
            <input className="checkout-control" name="phone" type="tel" placeholder="+7(___)___-__-__" aria-label="Телефон" autoComplete="tel" required />
            <input className="checkout-control" name="email" type="email" placeholder="E-mail" aria-label="E-mail" autoComplete="email" required />
          </div>
        </section>

        <section className="checkout-section">
          <h2>Доставка</h2>
          <select className="checkout-control" name="city" defaultValue="" aria-label="Город" required>
            <option value="" disabled>Город</option>
            <option value="moscow">Москва</option>
            <option value="spb">Санкт-Петербург</option>
            <option value="dubai">Дубай</option>
            <option value="other">Другой город</option>
          </select>
        </section>

        <section className="checkout-section">
          <h2>Оплата</h2>
          <select className="checkout-control" name="payment" aria-label="Способ оплаты" defaultValue="card">
            <option value="card">Мир/Visa/Mastercard</option>
            <option value="manager">Согласовать с менеджером</option>
          </select>
        </section>

        <section className="checkout-section">
          <h2>Комментарий к заказу</h2>
          <textarea className="checkout-control checkout-comment" name="comment" aria-label="Комментарий к заказу" rows="4" />
        </section>

        <div className="checkout-actions">
          <div className="checkout-consent">
            <input id="checkout-agreement" type="checkbox" name="agreement" defaultChecked required />
            <label htmlFor="checkout-agreement">
              Нажимая КУПИТЬ, я соглашаюсь с Политикой конфиденциальности и Офертой
            </label>
          </div>
          <button className="checkout-buy" type="submit">КУПИТЬ</button>
          {previewSubmitted && (
            <p className="checkout-demo-message" role="status">
              Это демонстрационная страница. Заказ и платёж не отправлены. Для покупки свяжитесь с менеджером Caviar.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
