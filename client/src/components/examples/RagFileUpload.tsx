import RagFileUpload from "../RagFileUpload";

export default function RagFileUploadExample() {
  const mockFiles = [
    {
      id: "1",
      filename: "company_data.pdf",
      uploadedAt: "2 hours ago",
    },
    {
      id: "2",
      filename: "product_catalog.csv",
      uploadedAt: "1 day ago",
    },
  ];

  return (
    <div className="p-6 max-w-2xl">
      <RagFileUpload
        files={mockFiles}
        onFileSelect={(file) => console.log("File selected:", file.name)}
        onRemoveFile={(id) => console.log("Remove file:", id)}
      />
    </div>
  );
}
