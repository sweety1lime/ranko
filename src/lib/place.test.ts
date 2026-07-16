import { describe, expect, it } from 'vitest';
import { isPlaceUrl, placeLinkText, placeMapHref, yandexMapsUrl } from './place';

describe('yandexMapsUrl', () => {
  it('пропускает короткую ссылку из «Поделиться»', () => {
    expect(yandexMapsUrl('https://yandex.ru/maps/-/CDeaZL0X')?.toString()).toBe(
      'https://yandex.ru/maps/-/CDeaZL0X',
    );
  });

  it('пропускает полную ссылку с параметрами и региональные домены', () => {
    expect(yandexMapsUrl('https://yandex.ru/maps/213/moscow/?ll=37.6%2C55.7&z=15')).not.toBeNull();
    expect(yandexMapsUrl('https://yandex.com.tr/maps/-/CDaBcD')).not.toBeNull();
    expect(yandexMapsUrl('https://maps.yandex.ru/?text=кафе')).not.toBeNull();
  });

  it('терпит пробелы по краям — их легко захватить при копировании', () => {
    expect(yandexMapsUrl('  https://yandex.ru/maps/-/CDeaZL0X  ')).not.toBeNull();
  });

  // Ключевое: href берётся из пользовательского ввода, поэтому всё, что не карты Яндекса, — null.
  it('отбивает исполняемые и не-https схемы', () => {
    expect(yandexMapsUrl('javascript:alert(1)')).toBeNull();
    expect(yandexMapsUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(yandexMapsUrl('http://yandex.ru/maps/-/CDeaZL0X')).toBeNull();
  });

  it('отбивает домены, лишь похожие на Яндекс', () => {
    expect(yandexMapsUrl('https://evil-yandex.ru/maps/-/CD')).toBeNull();
    expect(yandexMapsUrl('https://yandex.ru.evil.com/maps/-/CD')).toBeNull();
    expect(yandexMapsUrl('https://example.com/maps/-/CD')).toBeNull();
  });

  it('отбивает страницы Яндекса вне карт', () => {
    expect(yandexMapsUrl('https://yandex.ru/search/?text=кафе')).toBeNull();
    expect(yandexMapsUrl('https://yandex.ru/mapsomething')).toBeNull();
  });

  it('отбивает мусор вместо ссылки', () => {
    expect(yandexMapsUrl('https://')).toBeNull();
    expect(yandexMapsUrl('не ссылка')).toBeNull();
  });
});

describe('isPlaceUrl', () => {
  it('отличает ссылку от адреса текстом', () => {
    expect(isPlaceUrl('https://yandex.ru/maps/-/CD')).toBe(true);
    expect(isPlaceUrl('Тверская 3')).toBe(false);
  });

  // Любая схема — это попытка дать ссылку, и разбирать её надо как ссылку: негодная получит
  // честную ошибку, а не превратится молча в поиск по карте по строке «javascript:alert(1)».
  it('считает ссылкой любую схему, а не только https', () => {
    expect(isPlaceUrl('http://yandex.ru/maps/-/CD')).toBe(true);
    expect(isPlaceUrl('javascript:alert(1)')).toBe(true);
  });

  it('не принимает за схему двоеточие внутри адреса', () => {
    expect(isPlaceUrl('Тверская 3, вход со двора: код 42')).toBe(false);
    expect(isPlaceUrl('Main St: floor 2')).toBe(false);
  });
});

describe('placeMapHref', () => {
  it('для ссылки ведёт на саму точку', () => {
    expect(placeMapHref('https://yandex.ru/maps/-/CDeaZL0X', 'Москва')).toBe(
      'https://yandex.ru/maps/-/CDeaZL0X',
    );
  });

  it('для адреса строит поиск по карте, сузив его городом', () => {
    expect(placeMapHref('Тверская 3', 'Москва')).toBe(
      'https://yandex.ru/maps/?text=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0%2C%20%D0%A2%D0%B2%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F%203',
    );
  });

  it('без города ищет по одному адресу', () => {
    expect(placeMapHref('Тверская 3', null)).toBe(
      'https://yandex.ru/maps/?text=%D0%A2%D0%B2%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F%203',
    );
    expect(placeMapHref('Тверская 3', '   ')).toBe(
      'https://yandex.ru/maps/?text=%D0%A2%D0%B2%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F%203',
    );
  });

  it('экранирует символы, ломающие запрос', () => {
    expect(placeMapHref('Кафе & Бар #1', null)).toBe(
      'https://yandex.ru/maps/?text=%D0%9A%D0%B0%D1%84%D0%B5%20%26%20%D0%91%D0%B0%D1%80%20%231',
    );
  });

  it('нет места — нет ссылки', () => {
    expect(placeMapHref(null, 'Москва')).toBeNull();
    expect(placeMapHref('', 'Москва')).toBeNull();
    expect(placeMapHref('   ', 'Москва')).toBeNull();
  });

  // Строки в БД переживут смену правил валидации, поэтому рендер проверяет их заново.
  it('недоверенная ссылка не превращается в href', () => {
    expect(placeMapHref('javascript:alert(1)', null)).toBeNull();
    expect(placeMapHref('https://example.com/x', 'Москва')).toBeNull();
  });
});

describe('placeLinkText', () => {
  it('прячет сырой URL за словами, а адрес показывает как есть', () => {
    expect(placeLinkText('https://yandex.ru/maps/-/CDeaZL0X')).toBe('На карте');
    expect(placeLinkText('  Тверская 3  ')).toBe('Тверская 3');
  });
});
