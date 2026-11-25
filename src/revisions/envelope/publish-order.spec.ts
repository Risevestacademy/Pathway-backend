import {
  orderFor,
  PUBLISH_ORDER_CREATE,
  PUBLISH_ORDER_UPDATE,
} from './publish-order';

describe('publish-order', () => {
  it('orderFor(true) returns PUBLISH_ORDER_CREATE', () => {
    expect(orderFor(true)).toBe(PUBLISH_ORDER_CREATE);
  });
  it('orderFor(false) returns PUBLISH_ORDER_UPDATE', () => {
    expect(orderFor(false)).toBe(PUBLISH_ORDER_UPDATE);
  });
  it('PUBLISH_ORDER_CREATE has CAREER before RESOURCE', () => {
    expect(PUBLISH_ORDER_CREATE.indexOf('CAREER')).toBeLessThan(
      PUBLISH_ORDER_CREATE.indexOf('RESOURCE'),
    );
  });
  it('PUBLISH_ORDER_UPDATE has RESOURCE before CAREER', () => {
    expect(PUBLISH_ORDER_UPDATE.indexOf('RESOURCE')).toBeLessThan(
      PUBLISH_ORDER_UPDATE.indexOf('CAREER'),
    );
  });
});
