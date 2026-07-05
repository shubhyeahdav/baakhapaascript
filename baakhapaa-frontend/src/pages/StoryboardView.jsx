import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { storyboard } from "../services/api";

export default function StoryboardView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    storyboard.getAll(id).then((res) => setFrames(res.data));
  }, [id]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await storyboard.generate(id);
      setFrames(res.data.frames);
    } catch (err) {
      alert(err.response?.data?.detail || "Storyboard generation failed. Check your OpenAI API key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <div className="h-14 bg-surface border-b border-border flex items-center justify-between px-4">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white">&larr; Back to Script</button>
        <span className="text-white font-medium">Storyboard</span>
        <button onClick={handleGenerate} disabled={loading} className="btn-gold text-sm">
          {loading ? "Generating..." : "Generate Storyboard"}
        </button>
      </div>

      <div className="p-6">
        {frames.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No storyboard frames yet. Click Generate Storyboard to create them from your finalized script.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {frames.map((frame, i) => (
              <div key={frame.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="aspect-video bg-elevated flex items-center justify-center">
                  {frame.image_url ? (
                    <img src={frame.image_url} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-600 text-xs">No image generated</span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">Scene {i + 1}</span>
                    <span className="text-xs text-gold">{frame.shot_type}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
