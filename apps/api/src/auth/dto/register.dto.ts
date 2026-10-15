import { AUTH_LIMITS, SELF_SERVICE_ROLES, type SelfServiceRole } from '@agregator/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Укажите корректный email' })
  @MaxLength(AUTH_LIMITS.EMAIL_MAX)
  email!: string;

  @IsString()
  @Length(AUTH_LIMITS.PASSWORD_MIN, AUTH_LIMITS.PASSWORD_MAX, {
    message: `Пароль должен содержать от ${AUTH_LIMITS.PASSWORD_MIN} до ${AUTH_LIMITS.PASSWORD_MAX} символов`,
  })
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(AUTH_LIMITS.NAME_MIN, AUTH_LIMITS.NAME_MAX, {
    message: `Имя должно содержать от ${AUTH_LIMITS.NAME_MIN} до ${AUTH_LIMITS.NAME_MAX} символов`,
  })
  // Без управляющих и невидимых символов (переводы строк, нулевые байты, bidi-override).
  @Matches(/^[^\p{C}]+$/u, { message: 'Имя содержит недопустимые символы' })
  name!: string;

  // ADMIN намеренно отсутствует: роль администратора через регистрацию не получить.
  @IsIn(SELF_SERVICE_ROLES, { message: 'Выберите роль: заказчик или подрядчик' })
  role!: SelfServiceRole;
}
