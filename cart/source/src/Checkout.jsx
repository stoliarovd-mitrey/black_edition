import React, {useState} from 'react';
import './checkout.css';

const site = 'https://caviar-phones.ru';

export default function Checkout({items, asset, money}) {
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const [country, setCountry] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    setPreviewSubmitted(true);
  }

  return (
    <main className="checkout-page" id="checkout">
      <h1>ОФОРМЛЕНИЕ ЗАКАЗА</h1>
      <div className="checkout-layout">
      <aside className="checkout-summary" aria-label="Ваш заказ">
        <div className="checkout-summary-heading"><h2>Ваш заказ</h2><a href="#cart">Изменить</a></div>
        {items.length ? <>
          <div className="checkout-order-items">
            {items.map(item => <article className="checkout-order-item" key={item.id}>
              <div className="checkout-order-image"><img src={asset(item.image)} alt={item.name} /></div>
              <div className="checkout-order-details">
                <p className="checkout-order-category">{item.category}</p>
                <h3>{item.name}</h3>
                <p>{item.model}</p>
                <p>{item.color}{item.storage ? ` · ${item.storage}` : ''}{item.size ? ` · ${item.size}` : ''}</p>
                <p>Количество: {item.qty}</p>
                <strong>{money(item.price * item.qty)}</strong>
              </div>
            </article>)}
          </div>
          <div className="checkout-order-total"><span>Итого</span><strong>{money(items.reduce((sum, item) => sum + item.price * item.qty, 0))}</strong></div>
          <p className="checkout-shipping-note">Стоимость доставки уточняется при оформлении заказа</p>
        </> : <p className="checkout-empty">Ваша корзина пуста. <a href="#cart">Вернуться в корзину</a></p>}
      </aside>
      <form className="checkout-form" onSubmit={handleSubmit}>
        <section className="checkout-section">
          <h2>Контактная информация</h2>
          <select className="checkout-control" name="country" value={country} onChange={event => setCountry(event.target.value)} aria-label="Страна" required>
            <option value="" disabled>Страна</option>
            <option value="ru">Россия</option>
            <option value="ae">Объединённые Арабские Эмираты</option>
            <option value="gb">Великобритания</option>
            <option value="other">Другая страна</option>
          </select>
          {country === 'other' && <input className="checkout-control checkout-country-other" name="countryOther" placeholder="Укажите страну" aria-label="Укажите страну" autoComplete="country-name" required />}
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
          <h2>Адрес доставки</h2>
          <div className="delivery-fields">
            <label className="delivery-field">
              <span>Город</span>
              <input className="checkout-control" name="city" autoComplete="shipping address-level2" placeholder="Например, Москва" required />
            </label>
            <label className="delivery-field">
              <span>Улица и номер дома</span>
              <input className="checkout-control" name="address" autoComplete="shipping address-line1" placeholder="Улица, дом, корпус" required />
            </label>
            <div className="delivery-row">
              <label className="delivery-field">
                <span>Квартира или офис <small>необязательно</small></span>
                <input className="checkout-control" name="addressDetails" autoComplete="shipping address-line2" placeholder="Квартира, офис, этаж" />
              </label>
              <label className="delivery-field">
                <span>Почтовый индекс <small>необязательно</small></span>
                <input className="checkout-control" name="postalCode" autoComplete="shipping postal-code" placeholder="Индекс" />
              </label>
            </div>
          </div>
        </section>

        <section className="checkout-section">
          <h2>Оплата</h2>
          <select className="checkout-control" name="payment" aria-label="Способ оплаты" defaultValue="card">
            <option value="card">Оплата Мир/Visa/Mastercard</option>
            <option value="cash">Наличными (только в Москве)</option>
            <option value="sbp">СБП (qrcode)</option>
            <option value="bank">Оплата на расчетный счет</option>
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
          <button className="checkout-buy" type="submit" disabled={!items.length}>КУПИТЬ</button>
          {previewSubmitted && (
            <p className="checkout-demo-message" role="status">
              Это демонстрационная страница. Заказ и платёж не отправлены. Для покупки свяжитесь с менеджером Caviar.
            </p>
          )}
        </div>
      </form>
      </div>
    </main>
  );
}
