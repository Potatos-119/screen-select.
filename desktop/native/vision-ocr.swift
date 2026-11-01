// Reads a PNG from standard input and prints the text Apple Vision finds in it.
import Foundation
import Vision

let languages = ["ar-SA", "en-US"]

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

guard let supported = try? request.supportedRecognitionLanguages(),
  languages.allSatisfy(supported.contains)
else { fail("This Mac can't read Arabic with Vision") }
request.recognitionLanguages = languages

let image = FileHandle.standardInput.readDataToEndOfFile()
do {
  try VNImageRequestHandler(data: image).perform([request])
} catch {
  fail(error.localizedDescription)
}
let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
