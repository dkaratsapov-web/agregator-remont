import { USER_ROLE_LABELS, type UserDto } from '@agregator/shared';
import { ProgressRuler } from '@/components/ui/progress-ruler';
import { Stamp, StampEmpty } from '@/components/ui/stamp';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { CopyId } from './copy-id';
import { UserAvatar } from './user-avatar';

const formatPhone = (phone: string) =>
  phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4');

/** Штамп аккаунта: кто вы на площадке, номер для поддержки и насколько заполнен профиль. */
export function AccountStamp({ user }: { user: UserDto }) {
  const filled = [true, user.avatarVersion !== null, user.phone !== null, user.city !== null];
  const done = filled.filter(Boolean).length;
  return (
    <Stamp
      ariaLabel="Аккаунт"
      label="Аккаунт"
      title={user.name}
      aside={
        <UserAvatar
          name={user.name}
          avatarVersion={user.avatarVersion}
          shape="rounded-[8px]"
          className="size-11 text-base"
        />
      }
      rows={[
        ['Номер', <CopyId key="id" publicId={user.publicId} />],
        ['Роль', USER_ROLE_LABELS[user.role]],
        ['Email', user.email],
        ['Телефон', user.phone ? formatPhone(user.phone) : <StampEmpty key="p" />],
        ['Город', user.city ?? <StampEmpty key="c" />],
        [
          'Регистрация',
          <time key="t" dateTime={user.createdAt}>
            {formatDate(user.createdAt)}
          </time>,
        ],
        [
          'Профиль',
          <span key="r" className="block">
            <span className="tabular-nums">
              {done} из {filled.length}
            </span>
            <span className="ml-2 text-xs font-normal text-ink-soft">
              {done === filled.length ? 'заполнен' : 'фото, телефон и город'}
            </span>
            <ProgressRuler
              answered={done}
              total={filled.length}
              label="Заполнение профиля"
              className="mt-2"
            />
          </span>,
        ],
      ]}
      footer={
        <Link
          href="/account/settings#profile"
          className="inline-flex min-h-6 items-center font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-accent"
        >
          Изменить профиль
        </Link>
      }
    />
  );
}
