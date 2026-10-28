import ResourceManager from "../../components/ResourceManager";

const Categories = () => (
  <ResourceManager
    title="Categories"
    endpoint="categories"
    description="Organize products into clear inventory groups."
    fields={[
      { key: "name", label: "Category name", required: true },
      { key: "description", label: "Description", multiline: true },
    ]}
  />
);

export default Categories;
