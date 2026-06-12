type LayoutProps = {
  children: React.ReactNode;
};

/** Legacy nested resident routes redirect to flat dashboard pages. */
export default function ResidentIdLayout({ children }: LayoutProps) {
  return children;
}
