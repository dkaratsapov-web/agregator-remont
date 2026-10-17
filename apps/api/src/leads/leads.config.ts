import { PRIVACY_OPERATOR } from '@agregator/shared';

/**
 * Приём заявок включён, только когда заполнены реквизиты оператора персональных данных
 * (политика конфиденциальности). Провайдер, а не константа, чтобы тесты могли его заменить.
 */
export const LEADS_ENABLED = Symbol('LEADS_ENABLED');

export const leadsEnabledProvider = {
  provide: LEADS_ENABLED,
  useValue: PRIVACY_OPERATOR !== null,
};
