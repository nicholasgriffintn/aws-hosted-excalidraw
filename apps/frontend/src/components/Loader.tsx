interface LoaderProps {
  message?: string;
}

const Loader = ({ message = "Loading..." }: LoaderProps) => {
  return (
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <p>{message}</p>
    </div>
  );
};

export default Loader;
