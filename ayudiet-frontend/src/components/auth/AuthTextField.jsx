function AuthTextField({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  autoComplete,
  rightSlot,
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">
        {label}
      </span>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="w-full rounded-2xl border border-[#d9ddd2] bg-[#fbfbf8] px-4 py-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-100"
          required
        />
        {rightSlot ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            {rightSlot}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export default AuthTextField;
