import { useEffect, useState } from "react";
import { client } from "./lib/api";

type PingResponse = Awaited<
  ReturnType<Awaited<ReturnType<typeof client.api.ping.$get>>["json"]>
>;

function App() {
  const [data, setData] = useState<PingResponse | null>(null);

  useEffect(() => {
    client.api.ping.$get().then((res) => res.json()).then(setData);
  }, []);

  return <pre>{data ? JSON.stringify(data, null, 2) : "Loading..."}</pre>;
}

export default App;
