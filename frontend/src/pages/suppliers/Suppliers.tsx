import ResourceManager from "../../components/ResourceManager";

const Suppliers = () => (
  <ResourceManager
    title="Suppliers"
    endpoint="suppliers"
    description="Keep supplier contacts and product sourcing details up to date."
    fields={[
      { key: "name", label: "Supplier name", required: true },
      { key: "contact_person", label: "Contact person" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "address", label: "Address", multiline: true },
    ]}
  />
);

export default Suppliers;
