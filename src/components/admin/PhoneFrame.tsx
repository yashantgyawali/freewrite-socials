// A phone-shaped wrapper so a projected participant piece reads as "on a phone".
export default function PhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[2.5rem] border-[10px] border-zinc-900 bg-white shadow-2xl ${className ?? ""}`}
      style={{ aspectRatio: "9 / 19" }}
    >
      <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-zinc-900" />
      <div className="h-full w-full overflow-hidden rounded-[1.8rem]">{children}</div>
    </div>
  );
}
