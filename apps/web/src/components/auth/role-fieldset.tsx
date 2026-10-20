const ROLE_OPTIONS = [
  { value: 'CUSTOMER', title: 'Я заказчик', text: 'Публикую заказы' },
  { value: 'CONTRACTOR', title: 'Я подрядчик', text: 'Откликаюсь на заказы' },
] as const;

/** Выбор роли нового аккаунта: регистрация по паролю и шаг после входа через банк. */
export function RoleFieldset({
  defaultRole,
  onChange,
}: {
  defaultRole: string;
  onChange?: (role: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">Кто вы</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {ROLE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer gap-2 rounded-xl border border-line bg-surface px-3 py-3 transition-colors duration-150 sm:gap-3 sm:px-4 [@media(max-height:46rem)]:py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name="role"
              value={option.value}
              defaultChecked={defaultRole === option.value}
              onChange={onChange ? () => onChange(option.value) : undefined}
              className="mt-1 size-4 accent-[var(--accent)]"
              required
            />
            {/* На 320 px строка не помещалась в карточку (AUDIT_FINDINGS UX-13): шрифт меньше и
                перенос вместо выхода за рамку. */}
            <span className="min-w-0">
              <span className="block text-sm font-semibold min-[360px]:text-[15px] sm:text-base">
                {option.title}
              </span>
              <span className="mt-0.5 block text-sm text-ink-soft">{option.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
