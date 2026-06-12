type LayoutProps = {
  children: React.ReactNode;
};

/** Legacy nested home routes redirect to flat dashboard pages. */
export default function HomeIdLayout({ children }: LayoutProps) {
  return children;
}
